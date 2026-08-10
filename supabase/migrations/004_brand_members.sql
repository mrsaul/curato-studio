-- supabase/migrations/004_brand_members.sql
-- Apply in Supabase dashboard → SQL editor

-- 1. Brand invite links (one active invite per brand)
CREATE TABLE IF NOT EXISTS public.brand_invites (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id uuid NOT NULL REFERENCES public.contexts(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_id)
);

ALTER TABLE public.brand_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "art director manages invites" ON public.brand_invites;
CREATE POLICY "art director manages invites"
  ON public.brand_invites FOR ALL
  USING (context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid()))
  WITH CHECK (context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid()));

-- 2. Brand members (creators linked to brands)
CREATE TABLE IF NOT EXISTS public.brand_members (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id uuid NOT NULL REFERENCES public.contexts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_id, user_id)
);

ALTER TABLE public.brand_members ENABLE ROW LEVEL SECURITY;

-- Creator can read their own memberships
DROP POLICY IF EXISTS "creator reads own memberships" ON public.brand_members;
CREATE POLICY "creator reads own memberships"
  ON public.brand_members FOR SELECT
  USING (user_id = auth.uid());

-- Art director can manage members of their brands
DROP POLICY IF EXISTS "art director manages members" ON public.brand_members;
CREATE POLICY "art director manages members"
  ON public.brand_members FOR ALL
  USING (context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid()))
  WITH CHECK (context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid()));
