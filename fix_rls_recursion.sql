-- 1. Create a Secure Function to check Super Admin role
-- This function runs as the database owner (SECURITY DEFINER), bypassing RLS
-- This prevents infinite recursion when checking policies
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix Profiles RLS (Remove Recursion)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by users" ON profiles;

CREATE POLICY "Profiles are viewable by users" ON profiles
  FOR SELECT USING (
    auth.uid() = id             -- Users can see their own profile
    OR 
    public.is_super_admin()     -- Super Admins can see all profiles
  );

-- 3. Update Radios RLS to use the safe function
DROP POLICY IF EXISTS "Super Admin full access radios" ON radios;
CREATE POLICY "Super Admin full access radios" ON radios
  FOR ALL
  USING ( public.is_super_admin() );

-- 4. Update Verifications RLS
DROP POLICY IF EXISTS "Super Admin full access verifications" ON verifications;
CREATE POLICY "Super Admin full access verifications" ON verifications
  FOR ALL
  USING ( public.is_super_admin() );

-- 5. Update System Settings RLS
DROP POLICY IF EXISTS "Super Admin full access settings" ON system_settings;
CREATE POLICY "Super Admin full access settings" ON system_settings
  FOR ALL
  USING ( public.is_super_admin() );

-- 6. Update Summaries RLS
DROP POLICY IF EXISTS "Users can view relevant summaries" ON summaries;
CREATE POLICY "Users can view relevant summaries" ON summaries
  FOR SELECT USING (
    auth.uid() = client_id 
    OR auth.uid() = created_by 
    OR public.is_super_admin()
  );

-- 7. Update Radio Assignments RLS
DROP POLICY IF EXISTS "Admins can view their assignments" ON radio_assignments;
CREATE POLICY "Admins can view their assignments" ON radio_assignments
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_super_admin()
    );

-- 8. Update Batch Jobs RLS (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'batch_jobs') THEN
        DROP POLICY IF EXISTS "Super Admin full access batch_jobs" ON batch_jobs;
        EXECUTE 'CREATE POLICY "Super Admin full access batch_jobs" ON batch_jobs FOR ALL USING (public.is_super_admin())';
    END IF;
END $$;
