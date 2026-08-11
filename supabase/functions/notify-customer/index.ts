import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pushLine(token: string, to: string, text: string, attachmentUrl?: string, attachmentType?: string) {
  const messages: any[] = [{ type: "text", text }];
  if (attachmentUrl && attachmentType === "image") {
    messages.push({ type: "image", originalContentUrl: attachmentUrl, previewImageUrl: attachmentUrl });
  } else if (attachmentUrl) {
    messages.push({ type: "text", text: `เปิดไฟล์แนบ: ${attachmentUrl}` });
  }
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!response.ok) throw new Error(`LINE ส่งไม่สำเร็จ (${response.status}): ${await response.text()}`);
}

async function pushMeta(token: string, to: string, text: string, attachmentUrl?: string, attachmentType?: string) {
  const endpoint = `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text } }),
  });
  if (!response.ok) throw new Error(`Meta ส่งไม่สำเร็จ (${response.status}): ${await response.text()}`);
  if (attachmentUrl) {
    const attachmentResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: to },
        messaging_type: "RESPONSE",
        message: attachmentType === "image"
          ? { attachment: { type: "image", payload: { url: attachmentUrl, is_reusable: false } } }
          : { text: `เปิดไฟล์แนบ: ${attachmentUrl}` },
      }),
    });
    if (!attachmentResponse.ok) throw new Error(`Meta ส่งไฟล์ไม่สำเร็จ (${attachmentResponse.status}): ${await attachmentResponse.text()}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { order_id, session_id, message, attachment_url, attachment_type, attachment_name } = await req.json();
    if (!message) throw new Error("message required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("unauthorized");
    if (token !== serviceRoleKey) {
      const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData.user) throw new Error("unauthorized");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    // หา session แชทที่ผูกกับออเดอร์ (เว็บ / LINE / Meta)
    let sess: any = null;
    if (session_id) {
      const { data } = await supabase
        .from("chat_messages")
        .select("session_id, platform, line_user_id")
        .eq("session_id", session_id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      sess = data;
    }
    if (!sess && order_id) {
      const { data } = await supabase
        .from("chat_messages")
        .select("session_id, platform, line_user_id")
        .eq("order_id", order_id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      sess = data;
      if (!sess) {
        const { data: order } = await supabase
          .from("orders").select("customer_phone").eq("id", order_id).maybeSingle();
        if (order?.customer_phone) {
          const { data: byPhone } = await supabase
            .from("chat_messages")
            .select("session_id, platform, line_user_id")
            .eq("customer_phone", order.customer_phone)
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle();
          sess = byPhone;
        }
      }
    }

    const inferredPlatform = ["line", "facebook", "instagram"].find((value) => sess?.session_id?.startsWith(`${value}:`));
    const platform = inferredPlatform ?? sess?.platform ?? "web";
    const recipientId = sess?.line_user_id ?? (inferredPlatform ? sess.session_id.slice(inferredPlatform.length + 1) : null);
    if (recipientId && (platform === "line" || platform === "facebook" || platform === "instagram")) {
      const { data: integ } = await supabase
        .from("messaging_integrations")
        .select("channel_access_token, enabled")
        .eq("platform", platform).maybeSingle();
      if (integ?.enabled && integ.channel_access_token) {
        if (platform === "line") await pushLine(integ.channel_access_token, recipientId, message, attachment_url, attachment_type);
        else await pushMeta(integ.channel_access_token, recipientId, message, attachment_url, attachment_type);
      } else {
        throw new Error(`ยังไม่ได้เปิดใช้งานหรือตั้งค่าการเชื่อมต่อ ${platform}`);
      }
    }

    const { error: insertError } = await supabase.from("chat_messages").insert({
      order_id: order_id ?? null,
      sender_type: "admin",
      message,
      session_id: sess?.session_id ?? session_id ?? null,
      platform,
      line_user_id: recipientId,
      attachment_url: attachment_url ?? null,
      attachment_type: attachment_type ?? null,
      attachment_name: attachment_name ?? null,
    });
    if (insertError) throw insertError;

    if (sess?.session_id) {
      supabase.functions.invoke("send-push", {
        body: { session_id: sess.session_id, title: "🔔 อัปเดตออเดอร์", body: message.slice(0, 100), url: "/track" },
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true, delivered_to: platform ?? "web" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
