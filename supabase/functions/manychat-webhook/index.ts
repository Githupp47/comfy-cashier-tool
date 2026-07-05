// ManyChat External Request bridge
// Setup: ในโฟลว์ ManyChat → Action "External Request" (POST)
// URL: https://<project>.functions.supabase.co/manychat-webhook
// Body: {"subscriber_id":"{{user_id}}","message":"{{last_input_text}}","platform":"facebook"}
// Response Mapping: ใช้ field `reply` เป็น dynamic content ในข้อความถัดไป
// หรือ ManyChat v2 จะ auto-render ข้อความในฟิลด์ messages ให้เลย
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    // ManyChat ส่งได้หลายรูปแบบ — รองรับทั้ง flat และ nested
    const subscriberId: string =
      body.subscriber_id ?? body.user_id ?? body.id ?? body.subscriber?.id ?? "";
    const message: string =
      body.message ?? body.text ?? body.last_input_text ?? body.last_text_input ?? "";
    const platform: string = (body.platform ?? "facebook").toLowerCase();
    const customerName: string | null =
      body.name ?? body.first_name ?? body.full_name ?? null;

    if (!subscriberId || !message) {
      return json({
        version: "v2",
        content: {
          messages: [{ type: "text", text: "ขอโทษค่ะ ไม่ได้รับข้อความ 🙏" }],
        },
        reply: "ขอโทษค่ะ ไม่ได้รับข้อความ 🙏",
      });
    }

    const sessionId = `${platform}:${subscriberId}`;

    // เก็บข้อความลูกค้า
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      sender_type: "customer",
      message,
      platform,
      line_user_id: subscriberId,
      customer_name: customerName,
    });

    // เรียกบอทตอบ (sync — ManyChat รอ response)
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-bot-reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ session_id: sessionId, message }),
      }
    );
    const data = await res.json().catch(() => ({}));
    const reply: string = data?.reply || "ขอโทษค่ะ ลองใหม่อีกครั้งนะคะ 🙏";

    // Response format ที่ ManyChat External Request รองรับ
    return json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: reply }],
      },
      reply, // สำหรับใช้เป็น dynamic field ได้ด้วย
    });
  } catch (e: any) {
    console.error("manychat-webhook", e);
    return json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: "ระบบขัดข้องค่ะ 🙏" }],
      },
      reply: "ระบบขัดข้องค่ะ 🙏",
      error: e.message,
    });
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
