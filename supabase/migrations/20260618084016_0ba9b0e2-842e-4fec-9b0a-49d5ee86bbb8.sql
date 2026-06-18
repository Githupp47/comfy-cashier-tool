
-- TOPPINGS TABLE
CREATE TABLE IF NOT EXISTS public.toppings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text,
  stock_quantity integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.toppings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.toppings TO authenticated;
GRANT ALL ON public.toppings TO service_role;

ALTER TABLE public.toppings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view available toppings"
  ON public.toppings FOR SELECT
  USING (is_available = true OR auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can manage toppings"
  ON public.toppings FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_toppings_updated_at
  BEFORE UPDATE ON public.toppings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ORDER ITEMS: add toppings json column
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS toppings jsonb NOT NULL DEFAULT '[]'::jsonb;

-- DECREMENT STOCK trigger function (products + toppings)
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t jsonb;
  tid uuid;
  tqty integer;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
       SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - NEW.quantity),
           updated_at = now()
     WHERE id = NEW.product_id;
  END IF;

  IF NEW.toppings IS NOT NULL AND jsonb_typeof(NEW.toppings) = 'array' THEN
    FOR t IN SELECT * FROM jsonb_array_elements(NEW.toppings) LOOP
      tid := NULLIF(t->>'id','')::uuid;
      tqty := COALESCE((t->>'quantity')::int, 1) * NEW.quantity;
      IF tid IS NOT NULL THEN
        UPDATE public.toppings
           SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - tqty),
               updated_at = now()
         WHERE id = tid;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_stock ON public.order_items;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_product_stock();

-- NOTIFY STOCK on products
DROP TRIGGER IF EXISTS trg_notify_stock ON public.products;
CREATE TRIGGER trg_notify_stock
  AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.notify_stock_change();

-- NOTIFY STOCK on toppings (reuse function — uses NEW.name/id)
DROP TRIGGER IF EXISTS trg_notify_stock_toppings ON public.toppings;
CREATE TRIGGER trg_notify_stock_toppings
  AFTER UPDATE ON public.toppings
  FOR EACH ROW EXECUTE FUNCTION public.notify_stock_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.toppings;
