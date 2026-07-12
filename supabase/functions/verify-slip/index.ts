import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function pushLine(token: string, to: string, text: string) {
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
  } catch (e) { console.error('pushLine', e); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { order_id, session_id, auto = true } = await req.json();
    if (!order_id) throw new Error('missing order_id');

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: order, error } = await sb.from('orders').select('*').eq('id', order_id).maybeSingle();
    if (error || !order) throw new Error('order not found');
    if (!order.slip_url) throw new Error('ไม่พบสลิป');

    // Read configurable max age (hours) from shop_settings
    const { data: ageSetting } = await sb.from('shop_settings').select('value').eq('key', 'slip_max_age_hours').maybeSingle();
    const MAX_AGE_HOURS = Math.max(1, Number(ageSetting?.value) || 24);

    const prompt = `คุณคือระบบตรวจสอบสลิปโอนเงินธนาคารไทย ดึงข้อมูลจากสลิปและตอบเป็น JSON เท่านั้น:
{
  "amount": <ยอดเงินตัวเลข>,
  "date": "<YYYY-MM-DD หรือ null>",
  "time": "<HH:MM หรือ null>",
  "ref_no": "<เลขอ้างอิง/รหัสธุรกรรม หรือ null>",
  "sender_name": "<ชื่อผู้โอน หรือ null>",
  "sender_bank": "<ธนาคารผู้โอน หรือ null>",
  "receiver_name": "<ชื่อผู้รับ หรือ null>",
  "receiver_account": "<เลขบัญชี/พร้อมเพย์ผู้รับ หรือ null>",
  "receiver_bank": "<ธนาคารผู้รับ หรือ null>",
  "is_slip": <true/false>,
  "looks_edited": <true/false ดูมีการตัดต่อ/แต่งภาพหรือไม่>,
  "confidence": <0-1>
}`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: order.slip_url } },
          ],
        }],
      }),
    });
    if (!aiRes.ok) throw new Error(`AI error: ${(await aiRes.text()).slice(0, 200)}`);
    const aiJson = await aiRes.json();
    let raw = aiJson.choices?.[0]?.message?.content ?? '';
    raw = raw.replace(/```json\n?|\n?```/g, '').trim();
    let extracted: any = {};
    try { extracted = JSON.parse(raw); } catch { extracted = { parse_error: raw.slice(0, 300) }; }

    const expected = Number(order.total_amount || 0);
    const got = Number(extracted.amount || 0);
    const amount_match = expected > 0 && Math.abs(expected - got) < 0.5;
    const is_slip = extracted.is_slip !== false;
    const looks_edited = extracted.looks_edited === true;
    const confidence = Number(extracted.confidence ?? 0.7);
    const ref_no: string | null = extracted.ref_no ?? null;

    // --- Anti-fraud checks ---
    // 1) Old slip: date must be within 24h before now and >= order creation - 5min
    let stale = false;
    let future = false;
    let slip_ts: Date | null = null;
    if (extracted.date) {
      const dt = new Date(`${extracted.date}T${extracted.time || '00:00'}:00+07:00`);
      if (!isNaN(dt.getTime())) {
        slip_ts = dt;
        const now = Date.now();
        const orderTs = new Date(order.created_at).getTime();
        if (dt.getTime() < orderTs - 5 * 60 * 1000) stale = true;
        if (dt.getTime() > now + 10 * 60 * 1000) future = true;
        if (now - dt.getTime() > 24 * 60 * 60 * 1000) stale = true;
      }
    }

    // 2) Duplicate ref_no across other orders
    let duplicate = false;
    let dupOrderId: string | null = null;
    if (ref_no) {
      const { data: dups } = await sb.from('orders')
        .select('id')
        .eq('slip_ref_no', ref_no)
        .neq('id', order_id)
        .limit(1);
      if (dups && dups.length > 0) { duplicate = true; dupOrderId = dups[0].id; }
    }

    const problems: string[] = [];
    if (!is_slip) problems.push('รูปนี้ไม่ใช่สลิปโอนเงิน');
    if (!amount_match) problems.push(`ยอดไม่ตรง (สลิป ฿${got || '?'} ≠ ต้องโอน ฿${expected})`);
    if (stale) problems.push('สลิปเก่าเกิน 24 ชม. หรือก่อนสั่งซื้อ');
    if (future) problems.push('วันเวลาสลิปอยู่ในอนาคต');
    if (duplicate) problems.push(`สลิปซ้ำกับออเดอร์อื่น (#${dupOrderId?.slice(0, 8)})`);
    if (looks_edited) problems.push('ภาพมีร่องรอยการตัดต่อ');
    if (confidence < 0.5) problems.push('อ่านสลิปไม่ชัด');

    const auto_ok = auto && problems.length === 0;
    const result = {
      ...extracted,
      expected_amount: expected,
      amount_match,
      stale, future, duplicate, duplicate_order_id: dupOrderId,
      looks_edited,
      slip_iso: slip_ts?.toISOString() ?? null,
      auto_approved: auto_ok,
      problems,
    };

    // Find LINE user for this order (via chat sessions matching customer_phone)
    let notifySession = session_id as string | null;
    let lineUserId: string | null = null;
    if (order.customer_phone) {
      const { data: msgs } = await sb.from('chat_messages')
        .select('session_id, line_user_id, platform')
        .eq('customer_phone', order.customer_phone)
        .order('created_at', { ascending: false })
        .limit(10);
      if (msgs) {
        if (!notifySession) notifySession = msgs.find(m => m.session_id)?.session_id ?? null;
        const lineMsg = msgs.find(m => m.platform === 'line' && m.line_user_id);
        if (lineMsg) lineUserId = lineMsg.line_user_id;
      }
    }

    const orderShort = `#${String(order.id).slice(0, 8)}`;
    let customerMsg = '';

    if (auto_ok) {
      await sb.from('orders').update({
        slip_data: result,
        slip_status: 'approved',
        slip_ref_no: ref_no,
        slip_verified_at: new Date().toISOString(),
        status: order.status === 'pending' ? 'confirmed' : order.status,
      }).eq('id', order_id);
      customerMsg = `✅ ยืนยันการชำระเงินเรียบร้อยค่ะ (ออเดอร์ ${orderShort} · ฿${got.toLocaleString()})\nกำลังเตรียมออเดอร์ให้นะคะ 🙏`;
    } else {
      const reason = problems[0] || 'ต้องตรวจสอบเพิ่มเติม';
      const isReject = duplicate || future || (!is_slip && confidence > 0.6);
      await sb.from('orders').update({
        slip_data: result,
        slip_status: isReject ? 'rejected' : 'needs_review',
        slip_ref_no: ref_no,
        slip_reject_reason: problems.join(' • '),
      }).eq('id', order_id);
      const head = isReject ? '❌ ปฏิเสธสลิป' : '⏳ ต้องตรวจสอบเพิ่ม';
      customerMsg = `${head} (ออเดอร์ ${orderShort})\nสาเหตุ: ${problems.join(' • ')}\n${isReject ? 'กรุณาแนบสลิปที่ถูกต้อง' : 'แอดมินจะติดต่อกลับโดยเร็วค่ะ'} 🙏\nดูรายละเอียด: /track?phone=${encodeURIComponent(order.customer_phone || '')}`;
    }

    if (notifySession) {
      await sb.from('chat_messages').insert({
        session_id: notifySession, order_id, sender_type: 'bot', message: customerMsg,
        platform: lineUserId ? 'line' : 'web',
        line_user_id: lineUserId,
      });
    }

    if (lineUserId) {
      const { data: integ } = await sb.from('messaging_integrations')
        .select('channel_access_token, enabled').eq('platform', 'line').maybeSingle();
      if (integ?.enabled && integ.channel_access_token) {
        await pushLine(integ.channel_access_token, lineUserId, customerMsg);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
