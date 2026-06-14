## แผนการพัฒนา

### 1. แจ้งเตือนเสียงฝั่งลูกค้าแม้ปิดหน้า (Push Notification)
- ใช้ Web Push API + Service Worker ที่มีอยู่แล้ว (`public/sw.js`, edge function `send-push`)
- เพิ่มปุ่ม "🔔 เปิดแจ้งเตือน" ใน `ChatWidget` ให้ลูกค้ากดเพื่อ subscribe push
- เมื่อ admin ส่งข้อความ → trigger edge function `send-push` ส่ง notification ไปยัง subscription ของ session นั้น
- Service worker แสดง notification + เสียงเมื่อปิดหน้า

### 2. Bot ตอบแชทอัตโนมัติ (Admin Panel)
- สร้างตาราง `chat_bot_settings` (enabled, system_prompt, auto_reply_enabled)
- สร้าง edge function `chat-bot-reply` ใช้ Lovable AI Gateway (Gemini) ตอบกลับเมื่อลูกค้าส่งข้อความ
- ใน Admin Panel เพิ่ม tab "🤖 บอทตอบแชท":
  - เปิด/ปิดบอท
  - แก้ไข system prompt (เช่น "คุณเป็นผู้ช่วยร้านข้าวไอติม HAKKŌ ตอบคำถามเกี่ยวกับสินค้า ราคา การจัดส่ง")
  - บอทจะรู้ข้อมูลสินค้าจาก DB และตอบได้
- Trigger: เมื่อมีข้อความใหม่จากลูกค้าและ bot enabled → เรียก edge function → insert ข้อความตอบกลับจากบอท

### 3. จัดการสต็อกสินค้า + Export CSV อัตโนมัติ
- เพิ่มคอลัมน์ `stock_quantity` (integer) ใน `products`
- ใน `ProductsManager` เพิ่มช่องกรอกจำนวนสต็อก
- เพิ่มปุ่ม "📥 ดาวน์โหลด CSV สต็อก" ใน Admin → สร้างไฟล์ CSV ฝั่ง client ทันที
  - หัวข้อ: ชื่อ, ราคา, รายละเอียด, จำนวนสินค้า, ประเภทสินค้า, สายพันธุ์ข้าว, น้ำหนัก, สถานะ
- ทุกครั้งที่บันทึก/แก้ไขสต็อก ระบบจะ regenerate CSV และ trigger download อัตโนมัติ
- แสดง badge เตือนเมื่อสต็อกเหลือน้อย (< 5)

### รายละเอียดทางเทคนิค
- **DB Migration:** เพิ่ม `stock_quantity INTEGER DEFAULT 0` ใน `products`, สร้างตาราง `chat_bot_settings`
- **Edge Functions:** `chat-bot-reply` (ใหม่), `send-push` (ใช้ตัวเดิม trigger จาก admin send)
- **Frontend:**
  - `ChatWidget.tsx`: เพิ่มปุ่มเปิด push notification
  - `AdminChat.tsx`: trigger send-push หลังส่งข้อความ
  - `ProductsManager.tsx`: เพิ่มฟิลด์สต็อก + ปุ่ม download CSV + auto-export hook
  - `Admin.tsx`: เพิ่ม tab "🤖 บอท"
  - สร้าง `BotSettings.tsx` ใหม่
- **CSV:** generate ฝั่ง client ด้วย Blob + download link ผ่าน `URL.createObjectURL`