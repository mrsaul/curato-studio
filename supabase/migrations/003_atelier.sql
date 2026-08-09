-- supabase/migrations/003_atelier.sql
-- Apply in Supabase dashboard → SQL editor

-- 1. Scope templates to a brand (context)
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS context_id uuid REFERENCES public.contexts(id) ON DELETE SET NULL;

-- 2. Brand assets table
CREATE TABLE IF NOT EXISTS public.brand_assets (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id   uuid REFERENCES public.contexts(id) ON DELETE CASCADE NOT NULL,
  reviewer_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  storage_path text NOT NULL,
  url          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviewer owns brand assets" ON public.brand_assets;
CREATE POLICY "reviewer owns brand assets"
  ON public.brand_assets FOR ALL
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

-- 3. Storage bucket for brand assets (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "reviewer can upload brand assets" ON storage.objects;
CREATE POLICY "reviewer can upload brand assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "reviewer can read own brand assets" ON storage.objects;
CREATE POLICY "reviewer can read own brand assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "reviewer can delete own brand assets" ON storage.objects;
CREATE POLICY "reviewer can delete own brand assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
