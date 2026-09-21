import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const { message, image_url, test_mode, test_user_id, diagnose } = payload as any;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: integ } = await supabase
      .from("messaging_integrations")
      .select("enabled, channel_access_token")
      .eq("platform", "line")
      .maybeSingle();

    if (!integ?.enabled || !integ.channel_access_token) {
      throw new Error("ยังไม่ได้เชื่อม LINE หรือปิดใช้งานอยู่ — ตั้งค่าในแท็บเชื่อมต่อแชทก่อนนะคะ");
    }
    const token = integ.channel_access_token as string;
    const lineHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // known LINE user ids from chat history (session_id = "line:Uxxxx")
    const knownUserIds = async (): Promise<string[]> => {
      const { data } = await supabase
        .from("chat_messages")
        .select("session_id")
        .eq("platform", "line")
        .limit(5000);
      const ids = new Set<string>();
      for (const r of data ?? []) {
        const sid = String((r as any).session_id ?? "");
        const uid = sid.startsWith("line:") ? sid.slice(5) : "";
        if (uid.startsWith("U") && !uid.startsWith("Utest") && !uid.includes("test")) ids.add(uid);
      }
      return [...ids];
    };

    // ---- diagnose mode: ตรวจว่าโทเคนใช้ได้ไหม / ยิงบรอดแคสต์ได้ไหม ----
    if (diagnose) {
      const info = await fetch("https://api.line.me/v2/bot/info", { headers: lineHeaders });
      const infoRaw = await info.text();
      const quota = await fetch("https://api.line.me/v2/bot/message/quota", { headers: lineHeaders });
      const quotaRaw = await quota.text();
      const ids = await knownUserIds();
      return json({
        ok: info.ok,
        token_valid: info.ok,
        bot_info: info.ok ? JSON.parse(infoRaw) : infoRaw.slice(0, 300),
        quota: quota.ok ? JSON.parse(quotaRaw) : quotaRaw.slice(0, 300),
        known_chat_users: ids.length,
      });
    }

    if (!message || !String(message).trim()) throw new Error("message required");

    const text = test_mode
      ? `🧪 ทดสอบระบบ (ข้อความนี้ส่งเพื่อทดสอบเท่านั้น)\n\n${message}`
      : String(message);

    const messages: any[] = [];
    if (image_url && String(image_url).startsWith("https://")) {
      messages.push({ type: "image", originalContentUrl: image_url, previewImageUrl: image_url });
    }
    messages.push({ type: "text", text: text.slice(0, 4900) });

    // ---- โหมดทดสอบ: push หาไอดีเดียว ----
    if (test_mode && String(test_user_id ?? "").trim()) {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: lineHeaders,
        body: JSON.stringify({ to: String(test_user_id).trim(), messages }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`LINE ตอบกลับผิดพลาด (${res.status}): ${raw.slice(0, 300)}`);
      return json({ ok: true, mode: "test", sent: 1 });
    }

    // ---- ยิงจริง: broadcast ก่อน ถ้าไม่ได้ค่อย multicast หาเพื่อนที่เคยคุย ----
    const bres = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: lineHeaders,
      body: JSON.stringify({ messages }),
    });
    const braw = await bres.text();
    if (bres.ok) return json({ ok: true, mode: "broadcast" });

    console.error("broadcast failed", bres.status, braw.slice(0, 300));

    const ids = await knownUserIds();
    if (ids.length === 0) {
      throw new Error(
        `ยิงบรอดแคสต์ไม่ผ่าน (LINE ${bres.status}: ${braw.slice(0, 200)}) และยังไม่มีเพื่อนที่เคยทักแชทให้ส่งแทน`,
      );
    }

    let sent = 0;
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "POST",
        headers: lineHeaders,
        body: JSON.stringify({ to: chunk, messages }),
      });
      if (res.ok) sent += chunk.length;
      else errors.push(`${res.status}: ${(await res.text()).slice(0, 150)}`);
    }

    if (sent === 0) {
      throw new Error(
        `ส่งไม่สำเร็จ — บรอดแคสต์: ${bres.status} ${braw.slice(0, 150)} | ส่งรายคน: ${errors[0] ?? "ไม่ทราบสาเหตุ"}`,
      );
    }

    return json({
      ok: true,
      mode: "multicast",
      sent,
      note: `บรอดแคสต์ใช้ไม่ได้ (${bres.status}) จึงส่งตรงหาเพื่อนที่เคยทักแชท ${sent} คนแทน`,
    });
  } catch (e: any) {
    return json({ error: e.message }, 400);
  }
});
