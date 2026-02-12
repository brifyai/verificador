-- Enable RLS on radios
ALTER TABLE radios ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Super Admin full access radios" ON radios;
DROP POLICY IF EXISTS "Admin view assigned radios" ON radios;
DROP POLICY IF EXISTS "Users view own radios" ON radios;

-- Policy: Super Admin has full access to ALL radios
CREATE POLICY "Super Admin full access radios" ON radios
  FOR ALL
  USING (
    exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
  );

-- Policy: Admin can view assigned radios
CREATE POLICY "Admin view assigned radios" ON radios
  FOR SELECT
  USING (
    exists (select 1 from radio_assignments where user_id = auth.uid() and radio_id = radios.id)
  );

-- Fix Verifications RLS
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin full access verifications" ON verifications;
DROP POLICY IF EXISTS "Admin access assigned verifications" ON verifications;

CREATE POLICY "Super Admin full access verifications" ON verifications
  FOR ALL
  USING (
    exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
  );

CREATE POLICY "Admin access assigned verifications" ON verifications
  FOR ALL
  USING (
    exists (
      select 1 from radio_assignments ra
      where ra.user_id = auth.uid() 
      and ra.radio_id = verifications.radio_id
    )
  );

-- Fix Batch Jobs RLS (if table exists)
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'batch_jobs') THEN
        ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Super Admin full access batch_jobs" ON batch_jobs;
        DROP POLICY IF EXISTS "Admin access assigned batch_jobs" ON batch_jobs;
        
        EXECUTE 'CREATE POLICY "Super Admin full access batch_jobs" ON batch_jobs FOR ALL USING (exists (select 1 from profiles where id = auth.uid() and role = ''super_admin''))';
        
        EXECUTE 'CREATE POLICY "Admin access assigned batch_jobs" ON batch_jobs FOR ALL USING (exists (select 1 from radio_assignments ra where ra.user_id = auth.uid() and ra.radio_id = batch_jobs.radio_id))';
    END IF;
END $$;

-- Fix System Settings RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin full access settings" ON system_settings;

CREATE POLICY "Super Admin full access settings" ON system_settings
  FOR ALL
  USING (
    exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
  );
