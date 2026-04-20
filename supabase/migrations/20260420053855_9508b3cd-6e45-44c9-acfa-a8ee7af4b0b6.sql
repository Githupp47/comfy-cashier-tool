CREATE POLICY "Authenticated can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (true);