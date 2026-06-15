
CREATE TABLE public.messaging_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  channel_access_token TEXT,
  channel_secret TEXT,
  webhook_secret TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messaging_integrations TO authenticated;
GRANT ALL ON public.messaging_integrations TO service_role;

ALTER TABLE public.messaging_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage integrations"
ON public.messaging_integrations FOR ALL
TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_messaging_integrations_updated_at
BEFORE UPDATE ON public.messaging_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS line_user_id TEXT;

CREATE INDEX IF NOT EXISTS chat_messages_line_user_idx ON public.chat_messages(line_user_id);
