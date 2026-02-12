
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  
  const sql = `
    -- Fix radio_assignments table
    DROP TABLE IF EXISTS radio_assignments;
    
    CREATE TABLE radio_assignments (
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
  `;

  // Try to execute SQL via RPC
  // We assume 'exec_sql' RPC function exists as it is used in setup-roles
  const { error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    return NextResponse.json({ 
        error: error.message, 
        instructions: "The automatic fix failed. Please run the SQL manually in Supabase Dashboard SQL Editor.",
        sql: sql
    }, { status: 500 });
  }
  
  return NextResponse.json({ success: true, message: 'Schema fixed successfully: radio_assignments table recreated.' });
}
