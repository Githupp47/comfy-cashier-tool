ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS per_customer_limit integer,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  code text,
  customer_key text NOT NULL,
  customer_name text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_lookup
  ON public.promotion_redemptions (promotion_id, customer_key);

GRANT SELECT, INSERT ON public.promotion_redemptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_redemptions TO authenticated;
GRANT ALL ON public.promotion_redemptions TO service_role;

ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create redemptions" ON public.promotion_redemptions;
CREATE POLICY "Anyone can create redemptions" ON public.promotion_redemptions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view redemptions" ON public.promotion_redemptions;
CREATE POLICY "Anyone can view redemptions" ON public.promotion_redemptions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can delete redemptions" ON public.promotion_redemptions;
CREATE POLICY "Authenticated can delete redemptions" ON public.promotion_redemptions
  FOR DELETE TO authenticated USING (true);