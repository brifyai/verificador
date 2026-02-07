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
    const { name, address, url } = body;

    if (!name || !address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Get Global Settings (Root Drive Folder and Refresh Token)
    // We use getSupabaseAdmin to access system_settings securely
    const supabaseAdmin = getSupabaseAdmin();
    const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from('system_settings')
        .select('key, value')
        .in('key', ['drive_root_folder_id', 'google_refresh_token']);

    if (settingsError) {
        console.error('Error fetching global settings:', settingsError);
        return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    const settings: Record<string, string> = {};
    settingsData?.forEach(item => { settings[item.key] = item.value; });

    const rootFolderId = settings.drive_root_folder_id;
    const refreshToken = settings.google_refresh_token;

    if (!refreshToken) {
        return NextResponse.json({ error: 'System Google Drive not connected. Please ask Super Admin to connect Google Drive in Settings.' }, { status: 400 });
    }

    // 2. Create Folder in Google Drive
    let driveFolderId = null;
    try {
      driveFolderId = await createDriveFolder(name, rootFolderId, refreshToken);
    } catch (driveError: any) {
      console.error('Failed to create Drive folder:', driveError);
      
      let errorMessage = 'Failed to create Google Drive folder: ' + driveError.message;
      
      // Improve error message for 404/File not found which usually means permission issues
      if (driveError.code === 404 || (driveError.message && driveError.message.includes('File not found'))) {
        errorMessage = `Error: No se encontró la carpeta raíz (${rootFolderId}) o la cuenta de servicio no tiene permiso de acceso. Por favor comparte la carpeta con el email de la cuenta de servicio.`;
      }
      
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    // 3. Insert Radio into Supabase
    const { data: radio, error: insertError } = await supabase
      .from('radios')
      .insert([
        {
          name,
          address,
          url,
          user_id: user.id,
          drive_folder_id: driveFolderId,
        },
      ])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, radio });
  } catch (error: any) {
    console.error('Error creating radio:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
