import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { deleteDriveFile } from '@/lib/drive';

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

    // Role check (Robustness: check metadata)
    const role = user.user_metadata?.role || 'user';
    if (role !== 'admin' && role !== 'super_admin') {
       // Optional: Allow user to delete THEIR OWN radio?
       // The requirement says "eliminar las radios... solo debe aparecer para el super admin y admin".
       // This implies normal users CANNOT delete radios.
       return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const { radioId } = body;

    if (!radioId) {
      return NextResponse.json({ error: 'Missing radioId' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Get Radio Details (to find Drive Folder)
    const { data: radio, error: fetchError } = await supabaseAdmin
        .from('radios')
        .select('*')
        .eq('id', radioId)
        .single();

    if (fetchError || !radio) {
        return NextResponse.json({ error: 'Radio not found' }, { status: 404 });
    }

    // 2. Delete from Drive (if connected)
    if (radio.drive_folder_id) {
        // Fetch Refresh Token
        const { data: settingsData } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'google_refresh_token')
            .single();

        if (settingsData?.value) {
            try {
                await deleteDriveFile(radio.drive_folder_id, settingsData.value);
                console.log(`Deleted Drive folder: ${radio.drive_folder_id}`);
            } catch (driveError) {
                console.error('Failed to delete Drive folder:', driveError);
                // We continue to delete from DB even if Drive fails, 
                // but maybe we should warn? 
                // Usually better to clean up DB even if Drive fails to avoid ghosts.
            }
        }
    }

    // 3. Delete from Supabase (Cascades to verifications)
    // Also need to delete associated storage files (audios bucket)?
    // The bucket is structured as `{radioId}/{filename}`.
    // We should clean that up too.

    // 3a. Delete files from Storage
    const { data: fileList, error: listError } = await supabaseAdmin
        .storage
        .from('audios')
        .list(radioId);

    if (fileList && fileList.length > 0) {
        const filesToRemove = fileList.map(x => `${radioId}/${x.name}`);
        await supabaseAdmin.storage.from('audios').remove(filesToRemove);
        // Also remove the folder itself if needed (empty folder placeholder)
    }

    // 3b. Delete Record
    const { error: deleteError } = await supabaseAdmin
        .from('radios')
        .delete()
        .eq('id', radioId);

    if (deleteError) {
        throw deleteError;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error deleting radio:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
