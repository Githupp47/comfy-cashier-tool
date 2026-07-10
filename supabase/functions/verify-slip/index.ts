import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { order_id, session_id, auto = true } = await req.json();
    if (!order_id) throw new Error('missing order_id');

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: order, error } = await sb.from('orders').select('*').eq('id', order_id).maybeSingle();
    if (error || !order) throw new Error('order not found');
    if (!order.slip_url) throw new Error('ไม่พบสลิป');

    const prompt = `คุณคือระบบตรวจสอบสลิปโอนเงินธนาคารไทย ดึงข้อมูลจากสลิปในรูปภาพและตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{
  "amount": <ยอดเงินเป็นตัวเลข ไม่มี comma>,
  "date": "<YYYY-MM-DD หรือ null>",
  "time": "<HH:MM หรือ null>",
  "ref_no": "<เลขอ้างอิง/รหัสธุรกรรม หรือ null>",
  "sender_name": "<ชื่อผู้โอน หรือ null>",
  "sender_bank": "<ธนาคารผู้โอน หรือ null>",
  "receiver_name": "<ชื่อผู้รับ หรือ null>",
  "receiver_account": "<เลขบัญชี/พร้อมเพย์ผู้รับ หรือ null>",
  "receiver_bank": "<ธนาคารผู้รับ หรือ null>",
  "is_slip": <true/false รูปนี้เป็นสลิปโอนเงินจริงไหม>,
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

    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI error: ${t.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    let raw = aiJson.choices?.[0]?.message?.content ?? '';
    raw = raw.replace(/```json\n?|\n?```/g, '').trim();
    let extracted: any = {};
    try { extracted = JSON.parse(raw); } catch { extracted = { parse_error: raw.slice(0, 300) }; }

    const expected = Number(order.total_amount || 0);
    const got = Number(extracted.amount || 0);
    const amount_match = expected > 0 && Math.abs(expected - got) < 0.5;
    const is_slip = extracted.is_slip !== false; // treat undefined as true
    const confidence = Number(extracted.confidence ?? 0.7);

    const auto_ok = auto && is_slip && amount_match && confidence >= 0.5;
    const result = { ...extracted, expected_amount: expected, amount_match, auto_approved: auto_ok };

    // Find target chat session for customer notification
    let notifySession = session_id as string | null;
    if (!notifySession && order.customer_phone) {
      const { data: msg } = await sb.from('chat_messages')
        .select('session_id')
        .eq('customer_phone', order.customer_phone)
        .not('session_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      notifySession = msg?.session_id ?? null;
    }

    if (auto_ok) {
      await sb.from('orders').update({
        slip_data: result,
        slip_status: 'approved',
        slip_verified_at: new Date().toISOString(),
        status: order.status === 'pending' ? 'confirmed' : order.status,
      }).eq('id', order_id);

      const okMsg = `✅ ยืนยันการชำระเงินอัตโนมัติเรียบร้อยค่ะ (฿${got.toLocaleString()})\nกำลังเตรียมออเดอร์ให้นะคะ 🙏`;
      if (notifySession) {
        await sb.from('chat_messages').insert({
          session_id: notifySession, order_id, sender_type: 'bot', message: okMsg,
        });
      }
    } else {
      // Needs admin review — mark so admin gets an update-based alert
      const reason = !is_slip
        ? 'รูปไม่ใช่สลิป'
        : !amount_match
          ? `ยอดไม่ตรง (สลิป ฿${got || '?'} ≠ ต้องโอน ฿${expected})`
          : 'ต้องตรวจสอบเพิ่มเติม';
      await sb.from('orders').update({
        slip_data: result,
        slip_status: 'needs_review',
        slip_reject_reason: reason,
      }).eq('id', order_id);

      const waitMsg = `⏳ ได้รับสลิปแล้ว กำลังตรวจสอบเพิ่มเติม (${reason})\nแอดมินจะติดต่อกลับโดยเร็วค่ะ 🙏`;
      if (notifySession) {
        await sb.from('chat_messages').insert({
          session_id: notifySession, order_id, sender_type: 'bot', message: waitMsg,
        });
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
