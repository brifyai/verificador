
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Only Super Admin can update assignments' }, { status: 403 });
    }

    const { userId, assignedRadios } = await req.json();

    if (!userId || !Array.isArray(assignedRadios)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Delete existing assignments
    await supabaseAdmin
        .from('radio_assignments')
        .delete()
        .eq('admin_id', userId);

    // 2. Insert new assignments
    if (assignedRadios.length > 0) {
        const assignments = assignedRadios.map((radioId: string) => ({
            admin_id: userId,
            radio_id: radioId
        }));

        const { error: assignError } = await supabaseAdmin
            .from('radio_assignments')
            .insert(assignments);
            
        if (assignError) throw assignError;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Update Assignments Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
