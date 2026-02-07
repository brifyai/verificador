-- Create saved_phrases table
create table if not exists saved_phrases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add RLS policies for saved_phrases
alter table saved_phrases enable row level security;

create policy "Users can view their own saved phrases"
  on saved_phrases for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved phrases"
  on saved_phrases for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own saved phrases"
  on saved_phrases for delete
  using (auth.uid() = user_id);

-- Add drive_file_name to verifications table
alter table verifications 
add column if not exists drive_file_name text;
