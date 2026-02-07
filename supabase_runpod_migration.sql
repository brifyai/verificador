
-- Resource locks for managing shared resources (e.g., RunPod instances)
create table if not exists resource_locks (
  id text primary key,
  active_count int default 0,
  last_updated timestamp with time zone default now()
);

-- Initialize the runpod_whisper lock
insert into resource_locks (id, active_count) values ('runpod_whisper', 0) on conflict do nothing;

-- Function to acquire a lock (increment count)
create or replace function acquire_lock(resource_id text)
returns int
language plpgsql
security definer
as $$
declare
  new_count int;
begin
  -- Ensure row exists
  insert into resource_locks (id, active_count) values (resource_id, 0) on conflict do nothing;
  
  -- Increment
  update resource_locks
  set active_count = active_count + 1,
      last_updated = now()
  where id = resource_id
  returning active_count into new_count;
  
  return new_count;
end;
$$;

-- Function to release a lock (decrement count)
create or replace function release_lock(resource_id text)
returns int
language plpgsql
security definer
as $$
declare
  new_count int;
begin
  -- Decrement but don't go below 0
  update resource_locks
  set active_count = greatest(0, active_count - 1),
      last_updated = now()
  where id = resource_id
  returning active_count into new_count;
  
  return new_count;
end;
$$;

-- Grant permissions
grant execute on function acquire_lock to authenticated;
grant execute on function release_lock to authenticated;
grant execute on function acquire_lock to service_role;
grant execute on function release_lock to service_role;
