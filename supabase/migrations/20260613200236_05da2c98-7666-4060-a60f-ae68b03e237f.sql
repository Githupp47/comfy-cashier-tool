ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS idx_chat_messages_customer_phone
  ON public.chat_messages (customer_phone);