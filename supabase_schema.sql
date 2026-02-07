-- Create Radios table
create table radios (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  address text not null,
  url text,
  user_id uuid references auth.users not null
);

-- Enable RLS for Radios
alter table radios enable row level security;

create policy "Users can view their own radios" on radios
  for select using (auth.uid() = user_id);

create policy "Users can insert their own radios" on radios
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own radios" on radios
  for update using (auth.uid() = user_id);

create policy "Users can delete their own radios" on radios
  for delete using (auth.uid() = user_id);

-- Create Verifications table
create table verifications (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  radio_id uuid references radios(id) on delete cascade not null,
  audio_path text not null,
  target_phrase text not null,
  transcription text,
  is_match boolean,
  validation_rate text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  user_id uuid references auth.users not null
);

-- Enable RLS for Verifications
alter table verifications enable row level security;

create policy "Users can view their own verifications" on verifications
  for select using (auth.uid() = user_id);

create policy "Users can insert their own verifications" on verifications
  for insert with check (auth.uid() = user_id);

-- Storage bucket for audios
insert into storage.buckets (id, name, public) values ('audios', 'audios', true);

create policy "Users can upload audios" on storage.objects
  for insert with check (bucket_id = 'audios' and auth.uid() = owner);

create policy "Users can view audios" on storage.objects
  for select using (bucket_id = 'audios' and auth.uid() = owner);
