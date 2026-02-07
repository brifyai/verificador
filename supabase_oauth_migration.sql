-- Add google_refresh_token to profiles
alter table profiles add column if not exists google_refresh_token text;
