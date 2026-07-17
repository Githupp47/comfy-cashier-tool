ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee numeric NOT NULL DEFAULT 0;

INSERT INTO public.shop_settings (key, value) VALUES
  ('shipping_fee_flat', '30'),
  ('shipping_free_threshold', '300')
ON CONFLICT (key) DO NOTHING;