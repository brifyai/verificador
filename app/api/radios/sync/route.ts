import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listFiles, listFolders } from '@/lib/drive';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Recursive function to traverse folders and collect files
async function traverseFolder(folderId: string, refreshToken: string, depth: number = 0, maxDepth: number = 5): Promise<Array<{ file: any, parentId: string }>> {
  if (depth > maxDepth) return [];

  const results: Array<{ file: any, parentId: string }> = [];

  try {
    // 1. Get files in current folder
    try {
      const files = await listFiles(folderId, refreshToken);
      if (files && files.length > 0) {
        files.forEach(f => results.push({ file: f, parentId: folderId }));
      }
    } catch (err) {
      console.error(`Error listing files in folder ${folderId}:`, err);
    }

    // 2. Get subfolders
    let subFolders: any[] = [];
    try {
      subFolders = await listFolders(folderId, refreshToken);
    } catch (err) {
      console.error(`Error listing folders in folder ${folderId}:`, err);
    }

    // 3. Process subfolders sequentially to avoid rate limits and ensure stability
    if (subFolders && subFolders.length > 0) {
      for (const folder of subFolders) {
        // Add a small delay to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const subResults = await traverseFolder(folder.id, refreshToken, depth + 1, maxDepth);
        results.push(...subResults);
      }
    }
  } catch (error) {
    console.error(`Error traversing folder ${folderId}:`, error);
  }

  return results;
}

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

    // 1. Get Global Settings
    const supabaseAdmin = getSupabaseAdmin();
    const { data: settingsData, error: settingsError } = await supabaseAdmin
        .from('system_settings')
        .select('key, value')
        .in('key', ['drive_root_folder_id', 'google_refresh_token']);

    if (settingsError) {
        return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    const settings: Record<string, string> = {};
    settingsData?.forEach(item => { settings[item.key] = item.value; });

    const rootFolderId = settings.drive_root_folder_id;
    const refreshToken = settings.google_refresh_token;

    if (!refreshToken || !rootFolderId) {
        return NextResponse.json({ error: 'Google Drive not connected properly.' }, { status: 400 });
    }

    // 2. List Folders in Root
    let driveFolders = [];
    try {
        const files = await listFolders(rootFolderId, refreshToken);
        driveFolders = files || [];
    } catch (err: any) {
        return NextResponse.json({ error: 'Error listing Drive folders: ' + err.message }, { status: 500 });
    }

    // 3. Get Existing Radios
    const { data: existingRadios } = await supabase
        .from('radios')
        .select('id, drive_folder_id, name');

    const existingFolderIds = new Set(existingRadios?.map(r => r.drive_folder_id) || []);
    // Map folderId to radioId for quick lookup
    const folderIdToRadioId = new Map(existingRadios?.map(r => [r.drive_folder_id, r.id]) || []);

    // 4. Create Missing Radios and Collect IDs for Sync
    const createdRadios = [];
    const radiosToSync: Array<{ id: string, folderId: string }> = [];
    
    for (const folder of driveFolders) {
        let radioId = folderIdToRadioId.get(folder.id);

        if (folder.id && !existingFolderIds.has(folder.id)) {
            // Insert new radio
            const { data: newRadio, error } = await supabase
                .from('radios')
                .insert([{
                    name: folder.name,
                    address: folder.name, // Default address
                    user_id: user.id,
                    drive_folder_id: folder.id
                }])
                .select()
                .single();
            
            if (!error && newRadio) {
                createdRadios.push(newRadio);
                radioId = newRadio.id;
            }
        }

        if (radioId && folder.id) {
            radiosToSync.push({ id: radioId, folderId: folder.id });
        }
    }

    // 5. Sync Audios for All Radios (Recursive)
    let totalSyncedAudios = 0;
    
    // Process radios sequentially to avoid overwhelming the API
    for (const radio of radiosToSync) {
        try {
             // 5.1. List files recursively from Drive
            const allFiles = await traverseFolder(radio.folderId, refreshToken, 0, 5); // Depth 5
            
            if (allFiles.length === 0) continue;

            // 5.2. Get existing verifications to avoid duplicates
            const { data: existingVerifications } = await supabase
                .from('verifications')
                .select('drive_file_id')
                .eq('radio_id', radio.id)
                .not('drive_file_id', 'is', null);

            const existingIds = new Set(existingVerifications?.map(v => v.drive_file_id));

            // 5.3. Identify new files
            const newItems = allFiles.filter(item => item.file.id && !existingIds.has(item.file.id));

            if (newItems.length === 0) continue;

            // 5.4. Insert new pending verifications
            const toInsert = newItems.map(item => ({
                radio_id: radio.id,
                user_id: user.id,
                drive_file_id: item.file.id,
                drive_web_link: item.file.webViewLink,
                drive_file_name: item.file.name,
                drive_parent_folder_id: item.parentId,
                status: 'pending',
                target_phrase: null,
                audio_path: null,
                created_at: item.file.createdTime || new Date().toISOString(),
            }));

            const { error: insertError } = await supabase
                .from('verifications')
                .insert(toInsert);

            if (insertError) {
                console.error(`Error inserting verifications for radio ${radio.id}:`, insertError);
            } else {
                totalSyncedAudios += toInsert.length;
            }
        } catch (err) {
            console.error(`Error syncing audio for radio ${radio.id}:`, err);
        }
    }

    return NextResponse.json({ 
        success: true, 
        syncedCount: createdRadios.length, 
        syncedAudios: totalSyncedAudios,
        totalFound: driveFolders.length 
    });

  } catch (error: any) {
    console.error('Error syncing radios:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}