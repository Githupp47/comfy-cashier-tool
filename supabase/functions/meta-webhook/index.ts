// Meta (Facebook Messenger + Instagram) webhook — shared handler
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  // The webhook URL is shared: we detect platform by ?platform=facebook|instagram
  const platform = (url.searchParams.get("platform") || "facebook").toLowerCase();

  // Load integration record
  const { data: integ } = await supabase
    .from("messaging_integrations")
    .select("*")
    .eq("platform", platform)
    .maybeSingle();

  // Webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && integ?.webhook_secret && token === integ.webhook_secret) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    if (!integ || !integ.enabled || !integ.channel_access_token) {
      return new Response(JSON.stringify({ skipped: "not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    const entries = payload.entry ?? [];

    for (const entry of entries) {
      const events = entry.messaging ?? [];
      for (const ev of events) {
        const senderId: string | undefined = ev.sender?.id;
        const text: string | undefined = ev.message?.text;
        const isEcho = ev.message?.is_echo === true;
        if (!senderId || !text || isEcho) continue;

        const sessionId = `${platform}:${senderId}`;

        // Fetch profile name (best effort)
        let displayName: string | null = null;
        try {
          const profRes = await fetch(
            `https://graph.facebook.com/v20.0/${senderId}?fields=name&access_token=${integ.channel_access_token}`
          );
          if (profRes.ok) {
            const p = await profRes.json();
            displayName = p.name ?? null;
          }
        } catch (_) {}

        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          sender_type: "customer",
          message: text,
          platform,
          line_user_id: senderId, // reuse column to store platform user id
          customer_name: displayName,
        });

        // Trigger bot reply
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-bot-reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ session_id: sessionId, message: text }),
        }).catch((e) => console.error("bot reply trigger", e));
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("meta-webhook error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
