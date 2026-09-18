import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ต้องเป็นแอดมินที่ล็อกอินเท่านั้น
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, image_url, test_mode, test_user_id } = await req.json();
    if (!message || !String(message).trim()) throw new Error("message required");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: integ } = await supabase
      .from("messaging_integrations")
      .select("enabled, channel_access_token")
      .eq("platform", "line")
      .maybeSingle();

    if (!integ?.enabled || !integ.channel_access_token) {
      throw new Error("ยังไม่ได้เชื่อม LINE หรือปิดใช้งานอยู่ — ตั้งค่าในแท็บเชื่อมต่อแชทก่อนนะคะ");
    }

    const text = test_mode
      ? `🧪 ทดสอบระบบ (ข้อความนี้ส่งเพื่อทดสอบเท่านั้น)\n\n${message}`
      : String(message);

    const messages: any[] = [];
    if (image_url && String(image_url).startsWith("https://")) {
      messages.push({ type: "image", originalContentUrl: image_url, previewImageUrl: image_url });
    }
    messages.push({ type: "text", text: text.slice(0, 4900) });

    const endpoint = test_mode && test_user_id
      ? "https://api.line.me/v2/bot/message/push"
      : "https://api.line.me/v2/bot/message/broadcast";

    const body = test_mode && test_user_id
      ? { to: String(test_user_id).trim(), messages }
      : { messages };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${integ.channel_access_token}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`LINE ตอบกลับผิดพลาด (${res.status}): ${raw.slice(0, 300)}`);

    return new Response(JSON.stringify({ ok: true, mode: test_mode ? "test" : "broadcast" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
