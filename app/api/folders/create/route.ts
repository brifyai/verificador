import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createDriveFolder } from '@/lib/drive';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, parentId } = body;

    if (!name || !parentId) {
        return NextResponse.json({ error: 'Missing name or parentId' }, { status: 400 });
    }

    // Get Refresh Token
    const supabaseAdmin = getSupabaseAdmin();
    const { data: settingsData } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'google_refresh_token')
        .single();

    const refreshToken = settingsData?.value;

    if (!refreshToken) {
        return NextResponse.json({ error: 'System Google Drive not connected' }, { status: 400 });
    }

    const folderId = await createDriveFolder(name, parentId, refreshToken);

    return NextResponse.json({ success: true, folderId });

  } catch (error: any) {
    console.error('Error creating folder:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}