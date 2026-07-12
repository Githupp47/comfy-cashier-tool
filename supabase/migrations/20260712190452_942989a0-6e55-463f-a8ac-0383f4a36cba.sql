ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS slip_ref_no text;
CREATE INDEX IF NOT EXISTS idx_orders_slip_ref_no ON public.orders(slip_ref_no) WHERE slip_ref_no IS NOT NULL;