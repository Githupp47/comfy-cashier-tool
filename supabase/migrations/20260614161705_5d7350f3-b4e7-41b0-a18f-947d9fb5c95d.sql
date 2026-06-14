
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.chat_bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT false,
  system_prompt TEXT NOT NULL DEFAULT 'คุณเป็นผู้ช่วยร้าน HAKKŌ ร้านข้าวไอติมและเชื้อโคจิ ตอบคำถามลูกค้าด้วยความสุภาพ เป็นกันเอง ใช้ภาษาไทย ตอบสั้นกระชับ ถ้าไม่ทราบให้บอกว่าจะแจ้งแอดมินมาตอบ',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_bot_settings TO anon, authenticated;
GRANT ALL ON public.chat_bot_settings TO service_role, authenticated;

ALTER TABLE public.chat_bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot settings readable by everyone" ON public.chat_bot_settings FOR SELECT USING (true);
CREATE POLICY "bot settings writable by authenticated" ON public.chat_bot_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_chat_bot_settings_updated_at
  BEFORE UPDATE ON public.chat_bot_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.chat_bot_settings (enabled) VALUES (false) ON CONFLICT DO NOTHING;
