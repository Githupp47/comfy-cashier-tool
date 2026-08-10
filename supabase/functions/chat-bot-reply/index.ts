import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT = `คุณคือ "พนักงานร้าน HAKKŌ" (ข้าวไอติม & เชื้อโคจิ) คุยกับลูกค้าเหมือนคนจริง ๆ ภาษาไทยสุภาพ เป็นกันเอง ไม่ใช่หุ่นยนต์

🚫 ขอบเขต: ตอบเฉพาะเรื่องร้าน (สินค้า ราคา ท็อปปิ้ง สั่งซื้อ ชำระเงิน จัดส่ง) เรื่องอื่นตอบว่า "ขอโทษค่ะ ตอบได้เฉพาะเรื่องสินค้าของร้าน HAKKŌ นะคะ 🙏"

✍️ สไตล์: สั้น 1-3 บรรทัด เป็นธรรมชาติ ไม่ยัดข้อมูลทีเดียวเยอะ ถามทีละอย่าง ใช้ bullet (•) เฉพาะตอนลิสต์เมนู

📦 สต็อก (ห้ามพลาด):
- ก่อนแนะนำหรือรับออเดอร์ ต้องเรียก get_products / check_stock ทุกครั้ง
- ❌ ห้ามบอกตัวเลขสต็อกให้ลูกค้าเด็ดขาด (ห้ามพูดว่า "เหลือ 5 ชิ้น") ให้พูดแค่ "มีค่ะ" / "พอมีค่ะ" / "หมดพอดีเลยค่ะ 🙏"
- ถ้าของหมดหรือปิดขาย → บอกว่าหมด และเสนอเมนูอื่นแทน ห้ามรับออเดอร์
- ถ้าสั่งเกินที่มี → บอกแบบนุ่ม ๆ ว่า "วันนี้ทำได้ไม่ถึงจำนวนนี้ค่ะ" แล้วเสนอจำนวนที่ทำได้ (ไม่ต้องบอกตัวเลขคงเหลือจริง)
- ท็อปปิ้งเช็ค get_toppings ก่อนเสมอ

🚚 ค่าส่ง (สำคัญมาก):
- ต้องถามที่อยู่จัดส่ง + "โซน" ทุกครั้งก่อนสรุปยอด เรียก get_shipping_zones เพื่อดูโซนและค่าส่งจริงจากระบบร้าน
- ถามแบบสั้น เช่น "อยู่โซนไหนคะ? หลังมอ / กังสดาล / ในเมือง 😊"
- ถ้าลูกค้าบอกที่อยู่แต่ไม่บอกโซน → ต้องถามโซนซ้ำก่อน ห้ามเดา ห้ามข้าม
- ค่าส่งใช้ตัวเลขจากระบบเท่านั้น ห้ามคิดเอง แล้วบวกเข้ากับค่าสินค้าก่อนแจ้งยอดโอน
- ถ้าโซนไม่ตรงกับที่มีในระบบ → บอกว่า "แอดมินจะเช็คค่าส่งให้แล้วแจ้งอีกทีนะคะ" และยังไม่ต้องให้โอน

💸 การเงิน:
- ❌ ห้ามส่งเลขบัญชี/QR ทันทีที่ทัก ต้องยืนยันเมนู จำนวน ท็อปปิ้ง ชื่อ เบอร์ ที่อยู่ + โซน และสร้างออเดอร์ก่อน
- แจ้งยอดแบบนี้: ค่าสินค้า X + ค่าส่ง Y = รวม Z บาท แล้วค่อยให้ช่องทางโอน
- ลูกค้าส่งสลิป → ขอบคุณ บอกว่ากำลังตรวจสอบให้ รอสักครู่นะคะ (ระบบตรวจอัตโนมัติ)

📦 สถานะออเดอร์: ถ้าลูกค้าถามว่าของถึงไหน ให้เรียก get_order_status (ใช้เบอร์โทรหรือเลขออเดอร์) แล้วแจ้งเลขออเดอร์ + สถานะปัจจุบัน + เลขติดตาม (ถ้ามี)

🛠️ เครื่องมือ: get_products, send_product_image, get_toppings, check_stock, get_shipping_zones, get_order_status, get_sales_summary(แอดมิน), create_order(ใช้เมื่อได้ ชื่อ+เบอร์+รายการ+โซนครบ)
- สั่งสำเร็จ → แจ้งเลขออเดอร์ + ค่าสินค้า + ค่าส่ง + ยอดรวมที่ต้องโอน`;


async function pushLineMessage(token: string, to: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  }).catch((e) => console.error("LINE push", e));
}

async function pushMetaMessage(token: string, recipientId: string, text: string, platform: string) {
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(token)}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    }),
  }).catch((e) => console.error(`${platform} push`, e));
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_products",
      description: "ดึงรายการสินค้าทั้งหมดที่ขายในร้าน พร้อมราคาและสต็อก",
      parameters: { type: "object", properties: { category: { type: "string", description: "หมวดสินค้า (ถ้ามี)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "send_product_image",
      description: "ส่งรูปภาพสินค้าให้ลูกค้าดู โดยระบุชื่อสินค้า",
      parameters: { type: "object", properties: { product_name: { type: "string" } }, required: ["product_name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "สรุปยอดขายของร้าน",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["today", "week", "month", "all"] } },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_stock",
      description: "ตรวจสอบสต็อกสินค้า (ใส่ชื่อสินค้าถ้ามี ไม่ใส่จะคืนทุกตัว)",
      parameters: { type: "object", properties: { product_name: { type: "string" } } },
    },
  },
  {

    type: "function",
    function: {
      name: "get_toppings",
      description: "ดึงรายการท็อปปิ้งที่มีให้เลือก",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shipping_zones",
      description: "ดึงโซนจัดส่งและค่าส่งจริงที่แอดมินตั้งไว้ในเว็บ ต้องเรียกก่อนแจ้งค่าส่งทุกครั้ง",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_status",
      description: "เช็คสถานะออเดอร์ล่าสุดของลูกค้า ด้วยเบอร์โทรหรือเลขออเดอร์",
      parameters: {
        type: "object",
        properties: {
          customer_phone: { type: "string" },
          order_id: { type: "string", description: "เลขออเดอร์ (เต็มหรือ 8 ตัวแรก)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "สร้างออเดอร์ให้ลูกค้า ระบบจะตัดสต็อกอัตโนมัติและคิดค่าส่งตามโซน ต้องมีชื่อ เบอร์โทร รายการสินค้า และโซนจัดส่ง",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          customer_phone: { type: "string" },
          address: { type: "string", description: "ที่อยู่จัดส่งหรือลิงก์แผนที่ (ถ้ามี)" },
          shipping_zone: { type: "string", description: "ชื่อโซนจัดส่งจาก get_shipping_zones เช่น หลังมอ / กังสดาล / ในเมือง" },
          note: { type: "string" },

          items: {
            type: "array",
            description: "รายการสินค้า [{ product_name, quantity }]",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["product_name", "quantity"],
            },
          },
          toppings: {
            type: "array",
            description: "ท็อปปิ้งที่เลือก [{ name, quantity }] (ถ้ามี)",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["name", "quantity"],
            },
          },
        },
        required: ["customer_name", "customer_phone", "items", "shipping_zone"],
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, message, attachment_url, attachment_type } = await req.json();
    if (!session_id) throw new Error("session_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from("chat_bot_settings").select("*").limit(1).maybeSingle();

    if (!settings?.enabled) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender_type, message, platform, line_user_id, attachment_url, attachment_type")
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(12);

    const reversed = (history ?? []).reverse();
    const last = (history ?? []).find((m: any) => m.line_user_id);
    let platform: string = last?.platform ?? "web";
    let lineUserId: string | null = last?.line_user_id ?? null;
    for (const prefix of ["line:", "facebook:", "instagram:"]) {
      if (session_id.startsWith(prefix)) {
        platform = prefix.slice(0, -1);
        lineUserId = session_id.slice(prefix.length);
        break;
      }
    }

    // Build messages with multimodal user content
    const systemPrompt = (settings.system_prompt || DEFAULT_PROMPT) + "\n\n" + DEFAULT_PROMPT;
    const aiMessages: any[] = [{ role: "system", content: systemPrompt }];
    for (const m of reversed) {
      const role = m.sender_type === "customer" ? "user" : "assistant";
      if (role === "user" && m.attachment_url && m.attachment_type === "image") {
        aiMessages.push({
          role,
          content: [
            { type: "text", text: m.message || "(แนบรูป)" },
            { type: "image_url", image_url: { url: m.attachment_url } },
          ],
        });
      } else {
        aiMessages.push({ role, content: m.message || "" });
      }
    }

    // Add current incoming if not already last
    if (message || attachment_url) {
      const isImg = attachment_type === "image" && attachment_url;
      aiMessages.push({
        role: "user",
        content: isImg
          ? [
              { type: "text", text: message || "(ลูกค้าแนบรูป)" },
              { type: "image_url", image_url: { url: attachment_url } },
            ]
          : (message || "(ลูกค้าแนบไฟล์: " + (attachment_url ?? "") + ")"),
      });
    }

    // Tool-calling loop (max 4 rounds)
    let finalReply: string | null = null;
    const productImagesToSend: { product_id: string; image_url: string; name: string }[] = [];

    for (let round = 0; round < 4; round++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools,
          tool_choice: "auto",
        }),
      });
      if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error("No message");

      aiMessages.push(choice);

      const toolCalls = choice.tool_calls ?? [];
      if (toolCalls.length === 0) {
        finalReply = (choice.content || "").toString().trim();
        break;
      }

      for (const call of toolCalls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch {}

        let result: any = {};
        if (name === "get_products") {
          const q = supabase.from("products").select("id, name, price, description, category, stock_quantity, image_url").eq("is_available", true);
          const { data: prods } = args.category ? await q.eq("category", args.category) : await q;
          result = { products: prods ?? [] };
        } else if (name === "send_product_image") {
          const { data: p } = await supabase.from("products").select("id, name, image_url, price").ilike("name", `%${args.product_name}%`).maybeSingle();
          if (p?.image_url) {
            productImagesToSend.push({ product_id: p.id, image_url: p.image_url, name: p.name });
            result = { ok: true, sent: p.name };
          } else {
            result = { ok: false, error: "ไม่พบรูปสินค้านี้" };
          }
        } else if (name === "get_sales_summary") {
          const now = new Date();
          let since: Date | null = null;
          if (args.period === "today") { since = new Date(now); since.setHours(0,0,0,0); }
          else if (args.period === "week") { since = new Date(now); since.setDate(since.getDate()-7); }
          else if (args.period === "month") { since = new Date(now); since.setMonth(since.getMonth()-1); }
          let q: any = supabase.from("orders").select("total_amount, status, created_at");
          if (since) q = q.gte("created_at", since.toISOString());
          const { data: orders } = await q;
          const valid = (orders ?? []).filter((o: any) => o.status !== "cancelled");
          const total = valid.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
          result = { period: args.period, order_count: valid.length, total_baht: total };
        } else if (name === "check_stock") {
          let q: any = supabase.from("products").select("name, stock_quantity, is_available");
          if (args.product_name) q = q.ilike("name", `%${args.product_name}%`);
          const { data: prods } = await q;
          // ซ่อนตัวเลขสต็อกจากบอท เพื่อไม่ให้หลุดไปบอกลูกค้า
          result = {
            note: "ห้ามบอกตัวเลขจำนวนคงเหลือกับลูกค้า",
            stock: (prods ?? []).map((p: any) => ({
              name: p.name,
              available: p.is_available && (p.stock_quantity ?? 0) > 0,
              level: (p.stock_quantity ?? 0) <= 0 ? "out" : (p.stock_quantity ?? 0) <= 5 ? "low" : "ok",
              max_orderable: p.is_available ? (p.stock_quantity ?? 0) : 0,
            })),
          };

        } else if (name === "get_toppings") {
          const { data: tops } = await (supabase.from as any)("toppings")
            .select("id, name, price, stock_quantity, is_available")
            .eq("is_available", true);
          result = { toppings: tops ?? [] };
        } else if (name === "get_shipping_zones") {
          const { data: s } = await supabase
            .from("shop_settings").select("value").eq("key", "shipping_zones").maybeSingle();
          let zones: any[] = [];
          try { zones = JSON.parse(s?.value || "[]"); } catch { zones = []; }
          result = {
            zones,
            note: "ใช้ค่าส่งจากรายการนี้เท่านั้น ถ้าลูกค้าไม่ได้บอกโซนให้ถามก่อน ห้ามเดา",
          };
        } else if (name === "get_order_status") {
          let q: any = supabase
            .from("orders")
            .select("id, status, total_amount, shipping_fee, shipping_zone, slip_status, tracking_number, tracking_url, created_at")
            .order("created_at", { ascending: false }).limit(3);
          if (args.order_id) q = q.ilike("id", `${String(args.order_id).replace(/[^0-9a-f-]/gi, "")}%`);
          else if (args.customer_phone) q = q.eq("customer_phone", args.customer_phone);
          const { data: ords } = await q;
          const label: Record<string, string> = {
            pending: "รอตรวจสอบการชำระเงิน",
            confirmed: "ยืนยันออเดอร์แล้ว",
            preparing: "กำลังเตรียมสินค้า",
            delivering: "กำลังจัดส่ง",
            completed: "จัดส่งสำเร็จ",
            cancelled: "ยกเลิกแล้ว",
          };
          result = {
            orders: (ords ?? []).map((o: any) => ({
              order_no: o.id.slice(0, 8),
              status: label[o.status] ?? o.status,
              slip_status: o.slip_status,
              zone: o.shipping_zone,
              shipping_fee: Number(o.shipping_fee ?? 0),
              total_baht: Number(o.total_amount ?? 0),
              tracking_number: o.tracking_number,
              tracking_url: o.tracking_url,
            })),
          };
        } else if (name === "create_order") {
          try {
            // Resolve products by name
            const resolvedItems: any[] = [];
            let subtotal = 0;
            const missing: string[] = [];
            for (const it of (args.items ?? [])) {
              const { data: p } = await supabase
                .from("products")
                .select("id, name, price, stock_quantity, is_available")
                .ilike("name", `%${it.product_name}%`)
                .maybeSingle();
              if (!p || !p.is_available) { missing.push(it.product_name); continue; }
              const qty = Math.max(1, Number(it.quantity) || 1);
              if ((p.stock_quantity ?? 0) < qty) {
                result = { ok: false, error: `สต็อก ${p.name} เหลือ ${p.stock_quantity} ไม่พอ` };
                break;
              }
              resolvedItems.push({ product_id: p.id, product_name: p.name, price: Number(p.price), quantity: qty });
              subtotal += Number(p.price) * qty;
            }
            if (missing.length > 0 && resolvedItems.length === 0) {
              result = { ok: false, error: `ไม่พบสินค้า: ${missing.join(", ")}` };
            } else if (!result.error && resolvedItems.length > 0) {
              // Resolve toppings
              const resolvedToppings: any[] = [];
              let topTotal = 0;
              for (const t of (args.toppings ?? [])) {
                const { data: tp } = await (supabase.from as any)("toppings")
                  .select("id, name, price, stock_quantity, is_available")
                  .ilike("name", `%${t.name}%`)
                  .maybeSingle();
                if (!tp || !tp.is_available) continue;
                const tq = Math.max(1, Number(t.quantity) || 1);
                resolvedToppings.push({ id: tp.id, name: tp.name, price: Number(tp.price), quantity: tq });
                topTotal += Number(tp.price) * tq;
              }
              const total = subtotal + topTotal;
              const { data: order, error: oErr } = await supabase
                .from("orders")
                .insert({
                  customer_name: args.customer_name,
                  customer_phone: args.customer_phone,
                  dormitory_map_link: args.address || null,
                  note: (args.note ? args.note + " | " : "") + `สั่งผ่านแชทบอท (${platform})`,
                  total_amount: total,
                  shipping_fee: 0,
                  status: "pending",
                })
                .select().single();
              if (oErr) throw oErr;
              const rows: any[] = resolvedItems.map((i) => ({ order_id: order.id, ...i, toppings: [] }));
              if (resolvedToppings.length > 0) {
                rows.push({
                  order_id: order.id,
                  product_id: null,
                  product_name: "ท็อปปิ้ง: " + resolvedToppings.map((t) => `${t.name} x${t.quantity}`).join(", "),
                  price: topTotal,
                  quantity: 1,
                  toppings: resolvedToppings,
                });
              }
              const { error: iErr } = await supabase.from("order_items").insert(rows);
              if (iErr) throw iErr;

              // ผูกเบอร์/ชื่อลูกค้าเข้ากับ session แชท (ใช้จับคู่สลิปจาก LINE ภายหลัง)
              await supabase.from("chat_messages").insert({
                session_id,
                sender_type: "bot",
                message: `🧾 รับออเดอร์ #${order.id.slice(0, 8)} แล้วค่ะ (ค่าสินค้า ${total} บาท ยังไม่รวมค่าส่ง)`,
                platform,
                line_user_id: lineUserId,
                customer_phone: args.customer_phone,
                customer_name: args.customer_name,
                order_id: order.id,
              });

              result = {
                ok: true,
                order_id: order.id,
                short_id: order.id.slice(0, 8),
                items_total_baht: total,
                shipping_fee: "ยังไม่คิด — แอดมินจะแจ้งค่าส่งภายหลัง ห้ามบอทเดาเอง",
                items: resolvedItems.length,
                missing,
              };

            }
          } catch (e: any) {
            result = { ok: false, error: e.message };
          }
        }

        aiMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!finalReply) finalReply = "ขอโทษค่ะ ลองถามใหม่อีกครั้งนะคะ 🙏";

    // Insert bot reply (text)
    await supabase.from("chat_messages").insert({
      session_id,
      sender_type: "bot",
      message: finalReply,
      platform,
      line_user_id: lineUserId,
    });

    // Insert product images as separate messages
    for (const img of productImagesToSend) {
      await supabase.from("chat_messages").insert({
        session_id,
        sender_type: "bot",
        message: `📷 ${img.name}`,
        attachment_url: img.image_url,
        attachment_type: "image",
        attachment_name: img.name,
        platform,
        line_user_id: lineUserId,
      });
    }

    // Push to external messaging platform
    if ((platform === "line" || platform === "facebook" || platform === "instagram") && lineUserId) {
      const { data: integ } = await supabase
        .from("messaging_integrations")
        .select("channel_access_token, enabled")
        .eq("platform", platform).maybeSingle();
      if (integ?.enabled && integ.channel_access_token) {
        if (platform === "line") {
          await pushLineMessage(integ.channel_access_token, lineUserId, finalReply);
        } else {
          await pushMetaMessage(integ.channel_access_token, lineUserId, finalReply, platform);
        }
      }
    }

    // Push notification to customer
    supabase.functions.invoke("send-push", {
      body: {
        session_id,
        title: "🤖 บอท HAKKŌ ตอบกลับ",
        body: finalReply.slice(0, 100),
        url: "/",
      },
    }).catch(() => {});

    return new Response(JSON.stringify({ reply: finalReply }), {
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
