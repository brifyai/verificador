-- Enable RLS on storage.objects is NOT needed as it is enabled by default and we are not the owner
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 1. Super Admin Full Access
DROP POLICY IF EXISTS "Super Admin full access storage" ON storage.objects;
CREATE POLICY "Super Admin full access storage" ON storage.objects
  FOR ALL USING (public.is_super_admin());

-- 2. Admin Access to Verifications Bucket
DROP POLICY IF EXISTS "Admins can read verifications" ON storage.objects;
CREATE POLICY "Admins can read verifications" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verifications' 
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can upload verifications" ON storage.objects;
CREATE POLICY "Admins can upload verifications" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verifications' 
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update verifications" ON storage.objects;
CREATE POLICY "Admins can update verifications" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'verifications' 
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete verifications" ON storage.objects;
CREATE POLICY "Admins can delete verifications" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'verifications' 
    AND public.is_admin()
  );

-- 3. Client Access (Read Only for their summaries)
-- This is tricky because storage doesn't know about summaries table directly easily
-- But we can allow clients to read files if they are the owner or if we make it public (not recommended)
-- For now, let's assume signed URLs work if the creator has access. 
-- Wait, signed URLs bypass RLS check at download time if created by someone with access? 
-- Yes, createSignedUrl checks permission at creation time.
-- So we just need to ensure the ADMIN (who creates the summary/view) has access.
