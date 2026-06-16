
-- Chat attachments
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Stock alerts
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low','out')),
  stock_quantity INTEGER NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_alerts TO authenticated;
GRANT ALL ON public.stock_alerts TO service_role;

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read stock alerts"
  ON public.stock_alerts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can update stock alerts"
  ON public.stock_alerts FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Service role manages stock alerts"
  ON public.stock_alerts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Decrement stock when order_items inserted
CREATE OR REPLACE FUNCTION public.decrement_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - NEW.quantity),
        updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_stock ON public.order_items;
CREATE TRIGGER trg_decrement_stock
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.decrement_product_stock();

-- Notify low/out stock
CREATE OR REPLACE FUNCTION public.notify_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alert TEXT;
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    IF NEW.stock_quantity <= 0 THEN
      alert := 'out';
    ELSIF NEW.stock_quantity <= 5 THEN
      alert := 'low';
    ELSE
      alert := NULL;
    END IF;

    IF alert IS NOT NULL THEN
      INSERT INTO public.stock_alerts (product_id, product_name, alert_type, stock_quantity)
      VALUES (NEW.id, NEW.name, alert, NEW.stock_quantity);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stock ON public.products;
CREATE TRIGGER trg_notify_stock
AFTER UPDATE OF stock_quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.notify_stock_change();

-- Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.stock_alerts REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_alerts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
