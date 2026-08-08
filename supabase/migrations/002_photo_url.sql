-- Add photo_url column to creative_requests
ALTER TABLE creative_requests ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create post-photos storage bucket (public, for Claude Vision URL access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-photos', 'post-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Users can upload own photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: anyone can read photos (needed for Claude Vision URL access)
CREATE POLICY "Photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-photos');
