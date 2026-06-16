
## สรุปสิ่งที่จะทำ

### 1. แชทส่งรูป/ไฟล์ได้ (ลูกค้า ↔ ร้าน)
- เพิ่มปุ่ม 📎 ใน `ChatWidget` และ `AdminChat` อัพโหลดไป Storage bucket `chat-uploads` (สร้างใหม่, public)
- เพิ่มคอลัมน์ `attachment_url`, `attachment_type` (image/pdf/file), `attachment_name` ใน `chat_messages`
- Render รูปในแชทเป็น thumbnail คลิกขยาย, ไฟล์เป็นลิงก์ดาวน์โหลด
- รองรับสลิปโอนเงิน, รูปสินค้าที่ลูกค้าอยากถาม, PDF

### 2. บอทอ่านรูป/ไฟล์และตอบได้ (Multimodal)
- ใน `chat-bot-reply` ส่ง attachment_url ไปด้วยเป็น `image_url` part ให้ Gemini วิเคราะห์
- เช่น ลูกค้าส่งสลิป → บอทอ่านยอดเงิน + ยืนยัน, ส่งรูปสินค้า → บอทแนะนำ
- PDF: parse แล้วส่งเป็น file part

### 3. บอทตอบสั้น กระชับ อ่านง่าย
- ปรับ default system_prompt ให้: ตอบสั้น 1-3 บรรทัด, ใช้ emoji, bullet points
- ตัด prefix "🤖 " ออก ใส่เป็น sender_type='bot' แทนเพื่อแสดง badge แยก

### 4. บอทส่งรูปสินค้า + ตัดสต็อก + สรุปยอดขาย (Tool Calling)
- เปลี่ยน `chat-bot-reply` ใช้ AI SDK `tool` calling กับ Gemini:
  - `get_products(category?)` → คืนสินค้า + image_url
  - `send_product_image(product_id)` → insert message พร้อม attachment รูปสินค้า
  - `create_order(items, customer)` → สร้างออเดอร์ + ตัดสต็อก atomic
  - `get_sales_summary(period: today|week|month)` → query orders รวมยอด
  - `check_stock(product_id)` → คืนจำนวน
- ใช้ `stepCountIs(50)` รองรับ multi-step

### 5. ตัดสต็อกอัตโนมัติ + แจ้งเตือนสินค้าหมด
- สร้าง DB function `decrement_stock(product_id, qty)` + trigger บน `order_items` insert
- Trigger บน `products` UPDATE: ถ้า stock_quantity <= 0 หรือ <= 5 → insert ไป `stock_alerts` table
- หน้า Admin แสดง toast + badge สีแดง เมื่อสินค้าหมด (realtime subscription)

### 6. แจ้งเตือนออเดอร์ใหม่หน้า Admin
- Realtime subscription บน `orders` table ใน `OrdersManager` + Admin layout
- เล่นเสียง + toast + browser notification (ใช้ push subscription เดิม)
- Badge ตัวเลขออเดอร์ใหม่บน tab "ออเดอร์"

### 7. ข้อเสนอแนะเพิ่มเติม (จะทำให้เลย)
- **Dashboard สรุปยอด**: tab ใหม่ "📊 ภาพรวม" — ยอดวันนี้/สัปดาห์/เดือน, สินค้าขายดี, สต็อกใกล้หมด, กราฟ
- **Quick reply templates** ใน AdminChat (ข้อความสำเร็จรูป)
- **Auto-tag แชท**: บอทแท็ก session ว่า "สอบถาม/สั่งซื้อ/ชำระแล้ว/ร้องเรียน"
- **Export ยอดขาย CSV** รายวัน/เดือน

### รายละเอียดทางเทคนิค
- **DB Migration**:
  - ALTER `chat_messages` ADD `attachment_url, attachment_type, attachment_name`
  - CREATE `stock_alerts (product_id, alert_type, created_at, resolved)`
  - CREATE function `decrement_stock` + trigger บน `order_items`
  - CREATE function `notify_low_stock` + trigger บน `products`
  - ALTER PUBLICATION supabase_realtime ADD TABLE orders, stock_alerts, products
- **Storage**: bucket `chat-uploads` (public, 10MB limit, image/*, application/pdf)
- **Edge Functions**:
  - Rewrite `chat-bot-reply` → ใช้ AI SDK `streamText` + tools (multimodal)
  - ใหม่: `sales-summary` (helper สำหรับ dashboard)
- **Frontend**:
  - `ChatWidget.tsx`: ปุ่ม attach + render รูป/ไฟล์
  - `AdminChat.tsx`: ปุ่ม attach + render
  - `OrdersManager.tsx`: realtime + เสียง + toast
  - `Admin.tsx`: tab Dashboard ใหม่, badge ออเดอร์ใหม่
  - `BotSettings.tsx`: prompt default สั้นกระชับ
  - ใหม่: `SalesDashboard.tsx`
- **Bot prompt default** (ภาษาไทย, สั้น, emoji, ใช้ tool เมื่อจำเป็น)
