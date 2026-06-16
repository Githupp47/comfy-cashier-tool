
CREATE POLICY "Public read chat-uploads"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'chat-uploads');

CREATE POLICY "Public upload chat-uploads"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'chat-uploads');
