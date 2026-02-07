-- 1. Create saved_phrases table if it doesn't exist
create table if not exists saved_phrases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable RLS for saved_phrases
alter table saved_phrases enable row level security;

-- 3. Create policies for saved_phrases
do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'saved_phrases' and policyname = 'Users can view their own saved phrases') then
        create policy "Users can view their own saved phrases" on saved_phrases for select using (auth.uid() = user_id);
    end if;
    
    if not exists (select 1 from pg_policies where tablename = 'saved_phrases' and policyname = 'Users can insert their own saved phrases') then
        create policy "Users can insert their own saved phrases" on saved_phrases for insert with check (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies where tablename = 'saved_phrases' and policyname = 'Users can delete their own saved phrases') then
        create policy "Users can delete their own saved phrases" on saved_phrases for delete using (auth.uid() = user_id);
    end if;
end
$$;

-- 4. Add drive_file_name to verifications table if it doesn't exist
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'verifications' and column_name = 'drive_file_name') then
        alter table verifications add column drive_file_name text;
    end if;
end
$$;
