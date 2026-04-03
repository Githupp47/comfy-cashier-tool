
CREATE TABLE public.shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings" ON public.shop_settings
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage settings" ON public.shop_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_shop_settings_updated_at
  BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.shop_settings (key, value) VALUES
  ('shop_name', 'ข้าวไอติม & เชื้อโคจิ'),
  ('shop_tagline', 'จากทุ่งนาสู่ของอร่อย'),
  ('shop_phone', ''),
  ('shop_line_id', ''),
  ('logo_url', '');
