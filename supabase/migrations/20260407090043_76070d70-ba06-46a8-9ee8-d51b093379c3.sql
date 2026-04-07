
-- Allow authenticated users to delete orders and order_items
CREATE POLICY "Authenticated users can delete orders"
ON public.orders FOR DELETE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete order items"
ON public.order_items FOR DELETE TO authenticated
USING (true);

-- Chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL DEFAULT 'customer',
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create chat messages"
ON public.chat_messages FOR INSERT TO public
WITH CHECK (true);

CREATE POLICY "Anyone can view chat messages"
ON public.chat_messages FOR SELECT TO anon
USING (true);

CREATE POLICY "Authenticated can view chat messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can update chat messages"
ON public.chat_messages FOR UPDATE TO authenticated
USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
