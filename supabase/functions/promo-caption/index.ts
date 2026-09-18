import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { promo, is_test } = await req.json();
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const detail = [
      `ชื่อโปร: ${promo?.name ?? "-"}`,
      promo?.code ? `โค้ด: ${promo.code}` : "ไม่ต้องใช้โค้ด ลดอัตโนมัติ",
      promo?.discount_type === "percent"
        ? `ลด ${promo?.discount_value}%`
        : `ลด ${promo?.discount_value} บาท`,
      promo?.min_order_amount ? `ยอดขั้นต่ำ ${promo.min_order_amount} บาท` : "",
      promo?.max_discount ? `ลดสูงสุด ${promo.max_discount} บาท` : "",
      promo?.free_shipping ? "ส่งฟรี" : "",
      promo?.per_customer_limit ? `จำกัด ${promo.per_customer_limit} สิทธิ์ต่อคน` : "",
      promo?.ends_at ? `หมดเขต ${new Date(promo.ends_at).toLocaleDateString("th-TH")}` : "",
      promo?.description ? `รายละเอียด: ${promo.description}` : "",
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "คุณคือนักเขียนโฆษณาของร้าน HAKKŌ (ข้าวไอติม & เชื้อโคจิ) เขียนข้อความโปรโมชั่นส่งไลน์ ภาษาไทย น่ารัก ชวนซื้อ ไม่เกิน 5 บรรทัด ใช้อีโมจิพองาม ปิดท้ายด้วยชวนทักสั่งได้เลย ห้ามใส่มาร์กดาวน์",
          },
          {
            role: "user",
            content: `${is_test ? "(นี่คือการทดสอบระบบ ให้ระบุไว้ท้ายข้อความด้วย)\n" : ""}เขียนข้อความโปรโมชั่นจากข้อมูลนี้:\n${detail}`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const caption = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ caption }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
