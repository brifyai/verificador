import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Use service role to bypass RLS
    const { error } = await supabaseAdmin
      .from('verifications')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Error deleting verifications:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in delete route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
