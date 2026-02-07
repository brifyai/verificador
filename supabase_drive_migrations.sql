-- Create profiles table for global/user settings
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  drive_root_folder_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS for profiles
alter table profiles enable row level security;

create policy "Users can view their own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

-- Add drive_folder_id to radios
alter table radios add column if not exists drive_folder_id text;

-- Update verifications table
alter table verifications alter column target_phrase drop not null;
alter table verifications alter column audio_path drop not null;
alter table verifications add column if not exists drive_file_id text;
alter table verifications add column if not exists drive_web_link text;
