
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS slip_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS slip_data jsonb,
  ADD COLUMN IF NOT EXISTS slip_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS slip_reject_reason text;
