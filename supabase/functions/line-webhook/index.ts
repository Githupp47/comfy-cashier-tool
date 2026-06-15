import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load LINE credentials
    const { data: integ } = await supabase
      .from("messaging_integrations")
      .select("*")
      .eq("platform", "line")
      .maybeSingle();

    if (!integ || !integ.enabled || !integ.channel_access_token) {
      return new Response(JSON.stringify({ skipped: "line not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bodyText = await req.text();

    // Optional signature verification
    if (integ.channel_secret) {
      const signature = req.headers.get("x-line-signature");
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(integ.channel_secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const mac = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(bodyText)
      );
      const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
      if (signature !== expected) {
        console.warn("LINE signature mismatch", { signature, expected });
        return new Response("invalid signature", { status: 401, headers: corsHeaders });
      }
    }

    const payload = JSON.parse(bodyText);
    const events = payload.events ?? [];

    for (const ev of events) {
      if (ev.type !== "message" || ev.message?.type !== "text") continue;
      const lineUserId: string = ev.source?.userId;
      const text: string = ev.message.text;
      if (!lineUserId || !text) continue;

      // Get LINE display name
      let displayName: string | null = null;
      try {
        const profRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
          headers: { Authorization: `Bearer ${integ.channel_access_token}` },
        });
        if (profRes.ok) {
          const prof = await profRes.json();
          displayName = prof.displayName ?? null;
        }
      } catch (_) {}

      const sessionId = `line:${lineUserId}`;
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        sender_type: "customer",
        message: text,
        platform: "line",
        line_user_id: lineUserId,
        customer_name: displayName,
      });

      // Trigger bot reply
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-bot-reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ session_id: sessionId, message: text }),
        });
      } catch (e) {
        console.error("chat-bot-reply trigger failed", e);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("line-webhook error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
