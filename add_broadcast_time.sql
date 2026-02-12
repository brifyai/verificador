-- Add broadcast_time column to verifications table
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS broadcast_time TEXT;

-- Add broadcast_time column to batch_jobs table
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS broadcast_time TEXT;

-- Force refresh of the PostgREST schema cache to recognize the new columns immediately
NOTIFY pgrst, 'reload config';
