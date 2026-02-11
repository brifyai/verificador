-- Create batch_jobs table
create table if not exists batch_jobs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  radio_id uuid references radios(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  name text,
  status text default 'processing' check (status in ('processing', 'completed', 'error')),
  total_files integer default 0,
  processed_files integer default 0,
  total_duration_seconds numeric default 0,
  total_processing_seconds numeric default 0,
  estimated_cost numeric default 0,
  completed_at timestamp with time zone
);

-- Fix: Ensure created_at and other columns exist (in case table was created with different schema)
do $$
begin
  -- Add created_at if missing
  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'created_at') then
    alter table batch_jobs add column created_at timestamp with time zone default timezone('utc'::text, now()) not null;
  end if;

  -- Add radio_id if missing
  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'radio_id') then
    alter table batch_jobs add column radio_id uuid references radios(id) on delete cascade;
  end if;

  -- Add user_id if missing
  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'user_id') then
    alter table batch_jobs add column user_id uuid references auth.users(id);
  end if;

  -- Add name if missing
  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'name') then
    alter table batch_jobs add column name text;
  end if;
  
  -- Add status if missing
  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'status') then
    alter table batch_jobs add column status text default 'processing' check (status in ('processing', 'completed', 'error'));
  end if;

  -- Add counters if missing
  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'total_files') then
    alter table batch_jobs add column total_files integer default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'processed_files') then
    alter table batch_jobs add column processed_files integer default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'total_duration_seconds') then
    alter table batch_jobs add column total_duration_seconds numeric default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'total_processing_seconds') then
    alter table batch_jobs add column total_processing_seconds numeric default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'estimated_cost') then
    alter table batch_jobs add column estimated_cost numeric default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'batch_jobs' and column_name = 'completed_at') then
    alter table batch_jobs add column completed_at timestamp with time zone;
  end if;
end $$;

-- Enable RLS on batch_jobs
alter table batch_jobs enable row level security;

-- Drop existing policies to avoid conflicts
drop policy if exists "Users can view their own batch jobs" on batch_jobs;
drop policy if exists "Super admins can view all batch jobs" on batch_jobs;
drop policy if exists "Users can insert their own batch jobs" on batch_jobs;
drop policy if exists "Users can update their own batch jobs" on batch_jobs;

-- Policies for batch_jobs

-- 1. Users can view their own batch jobs
create policy "Users can view their own batch jobs"
  on batch_jobs for select
  using (auth.uid() = user_id);

-- 2. Super admins can view ALL batch jobs
create policy "Super admins can view all batch jobs"
  on batch_jobs for select
  using (
    (select raw_user_meta_data->>'role' from auth.users where id = auth.uid()) = 'super_admin'
  );

-- 3. Users can insert their own batch jobs
create policy "Users can insert their own batch jobs"
  on batch_jobs for insert
  with check (auth.uid() = user_id);

-- 4. Users can update their own batch jobs
create policy "Users can update their own batch jobs"
  on batch_jobs for update
  using (auth.uid() = user_id);

-- Add batch_id to verifications table if it doesn't exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'verifications' and column_name = 'batch_id') then
    alter table verifications add column batch_id uuid references batch_jobs(id) on delete set null;
  end if;
end $$;

-- Add transcription_json to verifications table if it doesn't exist (to store structured transcription)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'verifications' and column_name = 'transcription_json') then
    alter table verifications add column transcription_json jsonb;
  end if;
end $$;
