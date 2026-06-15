import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pushLineMessage(token: string, to: string, text: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("LINE push failed", res.status, t);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, message } = await req.json();
    if (!session_id || !message) throw new Error("session_id and message required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from("chat_bot_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings?.enabled) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: products } = await supabase
      .from("products")
      .select("name, price, description, category, rice_variety, weight, stock_quantity, is_available")
      .eq("is_available", true);

    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender_type, message, platform, line_user_id")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const messages = [
      {
        role: "system",
        content: `${settings.system_prompt}\n\nรายการสินค้าปัจจุบัน:\n${(products ?? []).map((p: any) => `- ${p.name} ราคา ฿${p.price} ${p.weight ?? ""} ${p.rice_variety ?? ""} (สต็อก: ${p.stock_quantity} ชิ้น)`).join("\n")}`,
      },
      ...(history ?? []).reverse().map((m: any) => ({
        role: m.sender_type === "customer" ? "user" : "assistant",
        content: m.message,
      })),
      { role: "user", content: message },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("AI gateway error", aiRes.status, text);
      throw new Error(`AI gateway error ${aiRes.status}: ${text}`);
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("No reply from AI");

    // Detect platform from session/history
    const last = (history ?? []).find((m: any) => m.line_user_id);
    const platform = session_id.startsWith("line:") ? "line" : (last?.platform ?? "web");
    const lineUserId = last?.line_user_id ?? (session_id.startsWith("line:") ? session_id.slice(5) : null);

    await supabase.from("chat_messages").insert({
      session_id,
      sender_type: "admin",
      message: `🤖 ${reply}`,
      platform,
      line_user_id: lineUserId,
    });

    // If LINE, push the reply back to the user
    if (platform === "line" && lineUserId) {
      const { data: integ } = await supabase
        .from("messaging_integrations")
        .select("channel_access_token, enabled")
        .eq("platform", "line")
        .maybeSingle();
      if (integ?.enabled && integ.channel_access_token) {
        await pushLineMessage(integ.channel_access_token, lineUserId, reply);
      }
    }

    return new Response(JSON.stringify({ reply }), {
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
