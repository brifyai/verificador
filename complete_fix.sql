-- COMPREHENSIVE FIX FOR PROFILES AND PERMISSIONS
-- This script ensures table structure is correct AND fixes RLS

-- 1. Ensure Table Structure (Columns exist)
DO $$ 
BEGIN
    -- Ensure role column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE profiles ADD COLUMN role text DEFAULT 'client';
    END IF;

    -- Ensure email column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE profiles ADD COLUMN email text;
    END IF;

    -- Ensure created_at column exists (Critical for sorting)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'created_at') THEN
        ALTER TABLE profiles ADD COLUMN created_at timestamptz DEFAULT now();
    END IF;
END $$;

-- 2. Create Secure Helper Functions (Security Definer)
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  -- Direct check bypassing RLS
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Reset and Apply Policies for PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by users" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Super Admin views all profiles" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Super Admin views all profiles" ON profiles
  FOR SELECT USING (public.is_super_admin());

-- 4. Reset and Apply Policies for RADIOS
ALTER TABLE radios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin full access radios" ON radios;
DROP POLICY IF EXISTS "Admin view assigned radios" ON radios;

CREATE POLICY "Super Admin full access radios" ON radios
  FOR ALL USING (public.is_super_admin());

CREATE POLICY "Admin view assigned radios" ON radios
  FOR SELECT USING (
    public.is_admin() 
    AND 
    EXISTS (SELECT 1 FROM radio_assignments WHERE user_id = auth.uid() AND radio_id = radios.id)
  );

-- 5. Reset and Apply Policies for VERIFICATIONS
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin full access verifications" ON verifications;
DROP POLICY IF EXISTS "Admin access assigned verifications" ON verifications;

CREATE POLICY "Super Admin full access verifications" ON verifications
  FOR ALL USING (public.is_super_admin());

CREATE POLICY "Admin access assigned verifications" ON verifications
  FOR ALL USING (
    public.is_admin()
    AND
    EXISTS (
      SELECT 1 FROM radio_assignments ra
      WHERE ra.user_id = auth.uid() 
      AND ra.radio_id = verifications.radio_id
    )
  );

-- 6. Reset and Apply Policies for SYSTEM SETTINGS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin full access settings" ON system_settings;

CREATE POLICY "Super Admin full access settings" ON system_settings
  FOR ALL USING (public.is_super_admin());

-- 7. Reset and Apply Policies for RADIO ASSIGNMENTS
ALTER TABLE radio_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view their assignments" ON radio_assignments;

CREATE POLICY "Admins can view their assignments" ON radio_assignments
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_super_admin()
    );

-- 8. Fix Batch Jobs RLS
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'batch_jobs') THEN
        ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Super Admin full access batch_jobs" ON batch_jobs;
        DROP POLICY IF EXISTS "Admin access assigned batch_jobs" ON batch_jobs;
        
        EXECUTE 'CREATE POLICY "Super Admin full access batch_jobs" ON batch_jobs FOR ALL USING (public.is_super_admin())';
        EXECUTE 'CREATE POLICY "Admin access assigned batch_jobs" ON batch_jobs FOR ALL USING (public.is_admin() AND EXISTS (SELECT 1 FROM radio_assignments ra WHERE ra.user_id = auth.uid() AND ra.radio_id = batch_jobs.radio_id))';
    END IF;
END $$;
