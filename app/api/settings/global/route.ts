import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET: Retrieve global settings
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('key, value')
    .in('key', ['drive_root_folder_id', 'google_refresh_token']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: any = {};
  data?.forEach(item => {
    if (item.key === 'google_refresh_token') {
        settings.isGoogleConnected = !!item.value;
    } else {
        settings[item.key] = item.value;
    }
  });

  return NextResponse.json(settings);
}

// POST: Update global settings (root folder id)
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const body = await req.json();
    const { drive_root_folder_id } = body;
  
    const supabaseAdmin = getSupabaseAdmin();

    if (drive_root_folder_id !== undefined) {
        const { error } = await supabaseAdmin.from('system_settings').upsert({
            key: 'drive_root_folder_id',
            value: drive_root_folder_id,
            updated_at: new Date().toISOString()
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || 'google_refresh_token';

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
        .from('system_settings')
        .delete()
        .eq('key', key);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
