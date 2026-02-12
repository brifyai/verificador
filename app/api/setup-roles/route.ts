
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  
  const sql = `
    -- Create user_role type
    DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'client');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    -- Create profiles table
    CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      role user_role DEFAULT 'client',
      created_at timestamptz DEFAULT now()
    );

    -- Enable RLS
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

    -- Policies
    DROP POLICY IF EXISTS "Profiles are viewable by users" ON profiles;
    CREATE POLICY "Profiles are viewable by users" ON profiles
      FOR SELECT USING (auth.uid() = id OR exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

    -- Trigger for new users
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, role)
      VALUES (new.id, new.email, 'client')
      ON CONFLICT (id) DO NOTHING;
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

    -- Radio Assignments
    CREATE TABLE IF NOT EXISTS radio_assignments (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      radio_id uuid REFERENCES radios(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      UNIQUE(admin_id, radio_id)
    );
    ALTER TABLE radio_assignments ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Admins can view their assignments" ON radio_assignments;
    CREATE POLICY "Admins can view their assignments" ON radio_assignments
        FOR SELECT USING (auth.uid() = admin_id OR exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

    -- Summaries
    CREATE TABLE IF NOT EXISTS summaries (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      created_by uuid REFERENCES profiles(id),
      client_id uuid REFERENCES profiles(id),
      title text NOT NULL,
      description text,
      data jsonb NOT NULL,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users can view relevant summaries" ON summaries;
    CREATE POLICY "Users can view relevant summaries" ON summaries
      FOR SELECT USING (auth.uid() = client_id OR auth.uid() = created_by OR exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

    -- Set Super Admin (Upsert)
    DO $$
    DECLARE
        sa_id uuid;
    BEGIN
        SELECT id INTO sa_id FROM auth.users WHERE email = 'brifyaimaster@gmail.com';
        IF sa_id IS NOT NULL THEN
            INSERT INTO profiles (id, email, role) VALUES (sa_id, 'brifyaimaster@gmail.com', 'super_admin')
            ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
        END IF;
    END $$;
  `;

  // Try to execute SQL via RPC if available
  const { error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    // If RPC fails, we return instructions
    return NextResponse.json({ 
        error: error.message, 
        instructions: "Please run the SQL manually in Supabase Dashboard SQL Editor.",
        sql: sql
    }, { status: 500 });
  }

  return NextResponse.json({ message: 'Roles setup successfully' });
}
