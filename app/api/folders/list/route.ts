import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listFolders } from '@/lib/drive';
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

    const body = await req.json();
    const { folderId } = body;

    if (!folderId) {
        return NextResponse.json({ error: 'Missing folderId' }, { status: 400 });
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

    const folders = await listFolders(folderId, refreshToken);

    return NextResponse.json({ success: true, folders });

  } catch (error: any) {
    console.error('Error listing folders:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}