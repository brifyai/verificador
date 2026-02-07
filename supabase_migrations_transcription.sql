-- Add full_transcription column to verifications table
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS full_transcription TEXT;
