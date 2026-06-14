import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Check if bot is enabled
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

    // Load product context
    const { data: products } = await supabase
      .from("products")
      .select("name, price, description, category, rice_variety, weight, stock_quantity, is_available")
      .eq("is_available", true);

    // Load recent conversation
    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender_type, message")
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
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${text}`);
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("No reply from AI");

    await supabase.from("chat_messages").insert({
      session_id,
      sender_type: "admin",
      message: `🤖 ${reply}`,
    });

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
