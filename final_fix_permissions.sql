-- Enable RLS on storage.objects (if not already enabled)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 1. Super Admin Full Access to ALL buckets
DROP POLICY IF EXISTS "Super Admin full access storage" ON storage.objects;
CREATE POLICY "Super Admin full access storage" ON storage.objects
  FOR ALL USING (public.is_super_admin());

-- 2. Admin Access to 'audios' Bucket (Read/Write)
DROP POLICY IF EXISTS "Admins can read audios" ON storage.objects;
CREATE POLICY "Admins can read audios" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audios' 
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can upload audios" ON storage.objects;
CREATE POLICY "Admins can upload audios" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audios' 
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update audios" ON storage.objects;
CREATE POLICY "Admins can update audios" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'audios' 
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete audios" ON storage.objects;
CREATE POLICY "Admins can delete audios" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'audios' 
    AND public.is_admin()
  );

-- 3. Add Metadata Columns to Verifications
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS drive_folder_name text;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS drive_parent_folder_id text;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS drive_file_name text;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS batch_job_id uuid REFERENCES batch_jobs(id);

-- 4. Ensure batch_jobs has radio_id and created_at (handled in supabase_batch_jobs.sql but good to double check)
-- (Skipping as it's likely fine, but adding columns is safe)
