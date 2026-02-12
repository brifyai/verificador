-- Add broadcast_time and broadcast_date columns to verifications table
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS broadcast_time TEXT;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS broadcast_date DATE;

-- Add broadcast_time and broadcast_date columns to batch_jobs table
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS broadcast_time TEXT;
ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS broadcast_date DATE;

-- Force refresh of the PostgREST schema cache
NOTIFY pgrst, 'reload config';
