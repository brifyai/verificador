import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listFiles, listFolders } from '@/lib/drive';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { extractBroadcastDateTime } from '@/lib/utils';

// Recursive function to traverse folders and collect files
async function traverseFolder(folderId: string, folderName: string, refreshToken: string, depth: number = 0, maxDepth: number = 5): Promise<Array<{ file: any, parentId: string, folderName: string }>> {
  if (depth > maxDepth) return [];

  const results: Array<{ file: any, parentId: string, folderName: string }> = [];

  try {
    // 1. Get files in current folder
    try {
      const files = await listFiles(folderId, refreshToken);
      if (files && files.length > 0) {
        files.forEach(f => results.push({ file: f, parentId: folderId, folderName: folderName }));
      }
    } catch (err) {
      console.error(`Error listing files in folder ${folderId}:`, err);
    }

    // 2. Get subfolders
    let subFolders: any[] = [];
    try {
      const result = await listFolders(folderId, refreshToken);
      subFolders = result || [];
    } catch (err) {
      console.error(`Error listing folders in folder ${folderId}:`, err);
    }

    // 3. Process subfolders sequentially
    if (subFolders && subFolders.length > 0) {
      for (const folder of subFolders) {
        // Add a small delay to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const subResults = await traverseFolder(folder.id, folder.name || 'Unknown', refreshToken, depth + 1, maxDepth);
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

    const body = await req.json();
    const { radioId, folderId } = body;

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
        // 1. List files recursively from Drive
        const targetFolderId = folderId || radio.drive_folder_id;
        
        // Use recursive traversal
        // We might need to fetch the root folder name if we want it precise, but 'Root' or 'Radio Folder' is a safe default for top level
        const allFiles = await traverseFolder(targetFolderId, 'Carpeta Principal', refreshToken, 0, 5); // Depth 5
        
        if (allFiles.length === 0) continue;

        // 2. Get existing verifications to avoid duplicates
        // We fetch ALL verifications for this radio to check against
        const { data: existingVerifications } = await supabase
          .from('verifications')
          .select('drive_file_id')
          .eq('radio_id', radio.id)
          .not('drive_file_id', 'is', null);

        const existingIds = new Set(existingVerifications?.map(v => v.drive_file_id));

        // 3. Identify new files
        const newItems = allFiles.filter(item => item.file.id && !existingIds.has(item.file.id));

        if (newItems.length === 0) continue;

        // Create Batch Job for this sync
        let batchJobId = null;
        try {
          const { data: batchJob, error: batchError } = await supabase
            .from('batch_jobs')
            .insert({
              radio_id: radio.id,
              user_id: user.id,
              name: `Sincronización Drive - ${new Date().toLocaleString()}`,
              // We set it to 'processing' so it shows up in the batch list as active/pending until items are processed
              status: 'processing', 
              total_files: newItems.length,
              processed_files: 0
            })
            .select()
            .single();

          if (!batchError && batchJob) {
            batchJobId = batchJob.id;
          } else {
             console.warn('Could not create batch job:', batchError);
          }
        } catch (e) {
          console.warn('Error creating batch job:', e);
        }

        // 4. Insert new pending verifications
        const toInsert = newItems.map(item => {
          const { date, time } = extractBroadcastDateTime(item.file.name);
          return {
            radio_id: radio.id,
            user_id: user.id,
            drive_file_id: item.file.id,
            drive_web_link: item.file.webViewLink,
            drive_file_name: item.file.name,
            drive_parent_folder_id: item.parentId, // Store specific parent folder
            drive_folder_name: item.folderName, // Store folder name
            batch_id: batchJobId, // Associate with batch
            status: 'pending',
            target_phrase: null, // User needs to fill this
            audio_path: null, // Not in Supabase Storage yet
            created_at: item.file.createdTime || new Date().toISOString(),
            broadcast_date: date,
            broadcast_time: time
          };
        });

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
