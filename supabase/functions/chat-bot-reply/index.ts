import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT = `คุณเป็นพนักงานร้าน HAKKŌ ร้านข้าวไอติม & เชื้อโคจิ ตอบเป็นภาษาไทยสุภาพ เป็นกันเอง
กฎสำคัญ:
- ตอบสั้น กระชับ 1-3 บรรทัด ใช้ emoji เล็กน้อยให้น่ารัก
- ใช้ bullet (•) เมื่อมีหลายข้อ
- ห้ามตอบยาวเป็นย่อหน้ายาว
- เมื่อลูกค้าถามสินค้าหรือราคา ใช้ tool get_products
- เมื่อลูกค้าอยากดูรูปสินค้า ใช้ tool send_product_image
- เมื่อลูกค้าถามยอดขาย/สรุป (เฉพาะแอดมิน) ใช้ tool get_sales_summary
- เมื่อลูกค้าถามว่าสินค้ามีเหลือไหม ใช้ tool check_stock
- ถ้าลูกค้าส่งสลิปโอนเงิน อ่านยอด/วันเวลา แล้วยืนยันรับสลิป บอกให้รอแอดมินตรวจสอบ
- ถ้าลูกค้าส่งรูปอื่น ดูแล้วตอบให้ตรงคำถาม`;

async function pushLineMessage(token: string, to: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  }).catch((e) => console.error("LINE push", e));
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_products",
      description: "ดึงรายการสินค้าทั้งหมดที่ขายในร้าน พร้อมราคาและสต็อก",
      parameters: { type: "object", properties: { category: { type: "string", description: "หมวดสินค้า (ถ้ามี)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "send_product_image",
      description: "ส่งรูปภาพสินค้าให้ลูกค้าดู โดยระบุชื่อสินค้า",
      parameters: { type: "object", properties: { product_name: { type: "string" } }, required: ["product_name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "สรุปยอดขายของร้าน",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["today", "week", "month", "all"] } },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_stock",
      description: "ตรวจสอบสต็อกสินค้า (ใส่ชื่อสินค้าถ้ามี ไม่ใส่จะคืนทุกตัว)",
      parameters: { type: "object", properties: { product_name: { type: "string" } } },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, message, attachment_url, attachment_type } = await req.json();
    if (!session_id) throw new Error("session_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from("chat_bot_settings").select("*").limit(1).maybeSingle();

    if (!settings?.enabled) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender_type, message, platform, line_user_id, attachment_url, attachment_type")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(12);

    const reversed = (history ?? []).reverse();
    const last = (history ?? []).find((m: any) => m.line_user_id);
    const platform = session_id.startsWith("line:") ? "line" : (last?.platform ?? "web");
    const lineUserId = last?.line_user_id ?? (session_id.startsWith("line:") ? session_id.slice(5) : null);

    // Build messages with multimodal user content
    const systemPrompt = (settings.system_prompt || DEFAULT_PROMPT) + "\n\n" + DEFAULT_PROMPT;
    const aiMessages: any[] = [{ role: "system", content: systemPrompt }];
    for (const m of reversed) {
      const role = m.sender_type === "customer" ? "user" : "assistant";
      if (role === "user" && m.attachment_url && m.attachment_type === "image") {
        aiMessages.push({
          role,
          content: [
            { type: "text", text: m.message || "(แนบรูป)" },
            { type: "image_url", image_url: { url: m.attachment_url } },
          ],
        });
      } else {
        aiMessages.push({ role, content: m.message || "" });
      }
    }

    // Add current incoming if not already last
    if (message || attachment_url) {
      const isImg = attachment_type === "image" && attachment_url;
      aiMessages.push({
        role: "user",
        content: isImg
          ? [
              { type: "text", text: message || "(ลูกค้าแนบรูป)" },
              { type: "image_url", image_url: { url: attachment_url } },
            ]
          : (message || "(ลูกค้าแนบไฟล์: " + (attachment_url ?? "") + ")"),
      });
    }

    // Tool-calling loop (max 4 rounds)
    let finalReply: string | null = null;
    const productImagesToSend: { product_id: string; image_url: string; name: string }[] = [];

    for (let round = 0; round < 4; round++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools,
          tool_choice: "auto",
        }),
      });
      if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error("No message");

      aiMessages.push(choice);

      const toolCalls = choice.tool_calls ?? [];
      if (toolCalls.length === 0) {
        finalReply = (choice.content || "").toString().trim();
        break;
      }

      for (const call of toolCalls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch {}

        let result: any = {};
        if (name === "get_products") {
          const q = supabase.from("products").select("id, name, price, description, category, stock_quantity, image_url").eq("is_available", true);
          const { data: prods } = args.category ? await q.eq("category", args.category) : await q;
          result = { products: prods ?? [] };
        } else if (name === "send_product_image") {
          const { data: p } = await supabase.from("products").select("id, name, image_url, price").ilike("name", `%${args.product_name}%`).maybeSingle();
          if (p?.image_url) {
            productImagesToSend.push({ product_id: p.id, image_url: p.image_url, name: p.name });
            result = { ok: true, sent: p.name };
          } else {
            result = { ok: false, error: "ไม่พบรูปสินค้านี้" };
          }
        } else if (name === "get_sales_summary") {
          const now = new Date();
          let since: Date | null = null;
          if (args.period === "today") { since = new Date(now); since.setHours(0,0,0,0); }
          else if (args.period === "week") { since = new Date(now); since.setDate(since.getDate()-7); }
          else if (args.period === "month") { since = new Date(now); since.setMonth(since.getMonth()-1); }
          let q: any = supabase.from("orders").select("total_amount, status, created_at");
          if (since) q = q.gte("created_at", since.toISOString());
          const { data: orders } = await q;
          const valid = (orders ?? []).filter((o: any) => o.status !== "cancelled");
          const total = valid.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
          result = { period: args.period, order_count: valid.length, total_baht: total };
        } else if (name === "check_stock") {
          let q: any = supabase.from("products").select("name, stock_quantity, is_available");
          if (args.product_name) q = q.ilike("name", `%${args.product_name}%`);
          const { data: prods } = await q;
          result = { stock: prods ?? [] };
        }

        aiMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!finalReply) finalReply = "ขอโทษค่ะ ลองถามใหม่อีกครั้งนะคะ 🙏";

    // Insert bot reply (text)
    await supabase.from("chat_messages").insert({
      session_id,
      sender_type: "bot",
      message: finalReply,
      platform,
      line_user_id: lineUserId,
    });

    // Insert product images as separate messages
    for (const img of productImagesToSend) {
      await supabase.from("chat_messages").insert({
        session_id,
        sender_type: "bot",
        message: `📷 ${img.name}`,
        attachment_url: img.image_url,
        attachment_type: "image",
        attachment_name: img.name,
        platform,
        line_user_id: lineUserId,
      });
    }

    // LINE push
    if (platform === "line" && lineUserId) {
      const { data: integ } = await supabase
        .from("messaging_integrations")
        .select("channel_access_token, enabled")
        .eq("platform", "line").maybeSingle();
      if (integ?.enabled && integ.channel_access_token) {
        await pushLineMessage(integ.channel_access_token, lineUserId, finalReply);
      }
    }

    // Push notification to customer
    supabase.functions.invoke("send-push", {
      body: {
        session_id,
        title: "🤖 บอท HAKKŌ ตอบกลับ",
        body: finalReply.slice(0, 100),
        url: "/",
      },
    }).catch(() => {});

    return new Response(JSON.stringify({ reply: finalReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
