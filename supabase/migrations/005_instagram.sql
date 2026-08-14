-- supabase/migrations/005_instagram.sql
-- Apply in Supabase dashboard → SQL editor

-- 1. Connected Instagram account, one per brand.
--    Deliberately has NO RLS policies: the access token must never be
--    readable by any client role. Service role only.
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  context_id       uuid PRIMARY KEY REFERENCES public.contexts(id) ON DELETE CASCADE,
  ig_user_id       text        NOT NULL,
  username         text,
  access_token     text        NOT NULL,
  token_expires_at timestamptz NOT NULL,
  needs_reconnect  boolean     NOT NULL DEFAULT false,
  connected_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
-- No policies by design. Any client-side read returns zero rows.

-- 2. Publish history. Also the idempotency record.
CREATE TABLE IF NOT EXISTS public.publish_attempts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id    uuid NOT NULL REFERENCES public.creative_requests(id) ON DELETE CASCADE,
  context_id    uuid NOT NULL REFERENCES public.contexts(id) ON DELETE CASCADE,
  published_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format        text NOT NULL CHECK (format IN ('feed','story')),
  status        text NOT NULL CHECK (status IN ('pending','published','failed')),
  ig_media_id   text,
  permalink     text,
  error_code    text,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publish_attempts_request_idx
  ON public.publish_attempts (request_id);

-- One successful publish per request per format. This is the backstop
-- against a double tap racing the application-level check.
CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_one_success
  ON public.publish_attempts (request_id, format)
  WHERE status = 'published';

ALTER TABLE public.publish_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read brand attempts" ON public.publish_attempts;
CREATE POLICY "members read brand attempts"
  ON public.publish_attempts FOR SELECT
  USING (
    context_id IN (SELECT context_id FROM public.brand_members WHERE user_id = auth.uid())
    OR context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid())
  );
