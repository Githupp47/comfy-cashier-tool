import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
};

async function pushLine(token: string, to: string, text: string) {
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
  } catch (e) { console.error("pushLine", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integ } = await supabase
      .from("messaging_integrations").select("*").eq("platform", "line").maybeSingle();

    if (!integ || !integ.enabled || !integ.channel_access_token) {
      return new Response(JSON.stringify({ skipped: "line not configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bodyText = await req.text();

    if (integ.channel_secret) {
      const signature = req.headers.get("x-line-signature");
      const key = await crypto.subtle.importKey("raw",
        new TextEncoder().encode(integ.channel_secret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyText));
      const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
      if (signature !== expected) {
        return new Response("invalid signature", { status: 401, headers: corsHeaders });
      }
    }

    const payload = JSON.parse(bodyText);
    const events = payload.events ?? [];

    for (const ev of events) {
      if (ev.type !== "message") continue;
      const lineUserId: string = ev.source?.userId;
      if (!lineUserId) continue;
      const sessionId = `line:${lineUserId}`;

      // Profile
      let displayName: string | null = null;
      try {
        const profRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
          headers: { Authorization: `Bearer ${integ.channel_access_token}` },
        });
        if (profRes.ok) displayName = (await profRes.json()).displayName ?? null;
      } catch (_) {}

      const mtype = ev.message.type;

      if (mtype === "text") {
        const text: string = ev.message.text;
        await supabase.from("chat_messages").insert({
          session_id: sessionId, sender_type: "customer", message: text,
          platform: "line", line_user_id: lineUserId, customer_name: displayName,
        });
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-bot-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ session_id: sessionId, message: text }),
        }).catch(() => {});
        continue;
      }

      if (mtype === "image") {
        // Download image content from LINE
        const contentRes = await fetch(`https://api-data.line.me/v2/bot/message/${ev.message.id}/content`, {
          headers: { Authorization: `Bearer ${integ.channel_access_token}` },
        });
        if (!contentRes.ok) { console.error("LINE content fetch failed"); continue; }
        const bytes = new Uint8Array(await contentRes.arrayBuffer());
        const path = `line/${lineUserId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from("slips").upload(path, bytes, {
          contentType: "image/jpeg", upsert: false,
        });
        if (upErr) { console.error("slip upload", upErr); continue; }
        const { data: pub } = supabase.storage.from("slips").getPublicUrl(path);
        const slipUrl = pub.publicUrl;

        // Insert customer chat message with image
        await supabase.from("chat_messages").insert({
          session_id: sessionId, sender_type: "customer",
          message: "📎 แนบสลิป",
          platform: "line", line_user_id: lineUserId, customer_name: displayName,
          attachment_url: slipUrl, attachment_type: "image", attachment_name: "slip.jpg",
        });

        // Find latest unverified order for this LINE user (via customer_phone in past chat)
        const { data: msgs } = await supabase.from("chat_messages")
          .select("customer_phone").eq("line_user_id", lineUserId)
          .not("customer_phone", "is", null)
          .order("created_at", { ascending: false }).limit(1);
        const phone = msgs?.[0]?.customer_phone;

        let orderId: string | null = null;
        if (phone) {
          const { data: ord } = await supabase.from("orders")
            .select("id").eq("customer_phone", phone)
            .in("slip_status", ["pending", "needs_review", "rejected"])
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (ord) {
            orderId = ord.id;
            await supabase.from("orders").update({
              slip_url: slipUrl, slip_status: "pending", slip_reject_reason: null,
            }).eq("id", orderId);
          }
        }

        if (orderId) {
          await pushLine(integ.channel_access_token, lineUserId,
            "📥 ได้รับสลิปแล้ว กำลังตรวจสอบด้วย AI...");
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/verify-slip`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({ order_id: orderId, session_id: sessionId, auto: true }),
          }).catch(() => {});
        } else {
          const msg = "📥 ได้รับสลิปแล้ว แต่ยังไม่พบออเดอร์ของคุณ\nกรุณาแจ้งเบอร์โทร + สั่งซื้อก่อนส่งสลิปนะคะ 🙏";
          await pushLine(integ.channel_access_token, lineUserId, msg);
          await supabase.from("chat_messages").insert({
            session_id: sessionId, sender_type: "bot", message: msg,
            platform: "line", line_user_id: lineUserId,
          });
        }
        continue;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("line-webhook error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
