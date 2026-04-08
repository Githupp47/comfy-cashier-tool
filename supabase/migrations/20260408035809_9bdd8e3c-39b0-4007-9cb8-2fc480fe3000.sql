
-- 1. Make order_id nullable and add session_id for anonymous chat
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_order_id_fkey;
ALTER TABLE public.chat_messages ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.chat_messages ADD COLUMN session_id text;

-- Re-add FK as nullable
ALTER TABLE public.chat_messages 
  ADD CONSTRAINT chat_messages_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

-- Index for session-based lookups
CREATE INDEX idx_chat_messages_session_id ON public.chat_messages(session_id);

-- 2. Push subscriptions table
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create push subscriptions"
  ON public.push_subscriptions FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Anyone can view own push subscription"
  ON public.push_subscriptions FOR SELECT TO public USING (true);

CREATE POLICY "Anyone can delete own push subscription"
  ON public.push_subscriptions FOR DELETE TO public USING (true);

CREATE POLICY "Authenticated can view all push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated USING (true);
