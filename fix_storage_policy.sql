-- Ensure Authenticated users (including Clients) can read from 'audios' bucket
-- This is required for the Client Summary view to play audios

BEGIN;

-- Policy for SELECT (Download/Read)
DROP POLICY IF EXISTS "Authenticated users can select audios" ON storage.objects;
CREATE POLICY "Authenticated users can select audios"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'audios');

-- Ensure 'anon' can also read if the bucket is public (optional, but good for shared links if we ever use them)
-- For now, we stick to authenticated as the client is logged in.

COMMIT;
