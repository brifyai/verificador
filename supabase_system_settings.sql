-- Create system_settings table for global configuration
create table if not exists system_settings (
  key text primary key,
  value text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS but restricts access (only Service Role can bypass, or specific policies)
alter table system_settings enable row level security;

-- Only allow authenticated users to view non-sensitive settings (optional, better to manage via API)
-- For now, we will deny all direct access from client and use API routes with Service Role
create policy "Deny all direct access" on system_settings
  for all using (false);
