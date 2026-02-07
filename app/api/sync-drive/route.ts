import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listFiles } from '@/lib/drive';
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
    const { radioId } = body;

    // Fetch radios to sync
    let query = supabase.from('radios').select('*').eq('user_id', user.id);
    if (radioId) {
      query = query.eq('id', radioId);
    }
    
    // Filter only radios with drive_folder_id
    const { data: radios, error: radiosError } = await query;
    
    if (radiosError) {
      return NextResponse.json({ error: radiosError.message }, { status: 500 });
    }

    // Get Global Refresh Token
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

    const radiosWithDrive = radios?.filter(r => r.drive_folder_id) || [];
    let newFilesCount = 0;

    for (const radio of radiosWithDrive) {
      try {
        // 1. List files from Drive
        const driveFiles = await listFiles(radio.drive_folder_id, refreshToken);
        
        if (!driveFiles || driveFiles.length === 0) continue;

        // 2. Get existing verifications for this radio to avoid duplicates
        // We only care about checking if the drive_file_id already exists
        const { data: existingVerifications } = await supabase
          .from('verifications')
          .select('drive_file_id')
          .eq('radio_id', radio.id)
          .not('drive_file_id', 'is', null);

        const existingIds = new Set(existingVerifications?.map(v => v.drive_file_id));

        // 3. Identify new files
        const newFiles = driveFiles.filter(f => f.id && !existingIds.has(f.id));

        if (newFiles.length === 0) continue;

        // 4. Insert new pending verifications
        const toInsert = newFiles.map(f => ({
          radio_id: radio.id,
          user_id: user.id,
          drive_file_id: f.id,
          drive_web_link: f.webViewLink,
          drive_file_name: f.name,
          status: 'pending',
          target_phrase: null, // User needs to fill this
          audio_path: null, // Not in Supabase Storage yet
          created_at: f.createdTime || new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from('verifications')
          .insert(toInsert);

        if (insertError) {
          console.error(`Error inserting verifications for radio ${radio.id}:`, insertError);
        } else {
          newFilesCount += toInsert.length;
        }

      } catch (err) {
        console.error(`Error syncing radio ${radio.id}:`, err);
      }
    }

    return NextResponse.json({ success: true, synced: newFilesCount });
  } catch (error: any) {
    console.error('Error syncing drive:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
