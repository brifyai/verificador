import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOAuth2Client } from '@/lib/drive';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/dashboard/settings';
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;
    const authHeader = req.headers.get('Authorization');

    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    // Verify user is authenticated
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

    // Exchange code for tokens
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      const supabaseAdmin = getSupabaseAdmin();
      
      // Save refresh token to system_settings (Global)
      const { error: updateError } = await supabaseAdmin
        .from('system_settings')
        .upsert({
            key: 'google_refresh_token',
            value: tokens.refresh_token,
            updated_at: new Date().toISOString()
        });

      if (updateError) {
        console.error('Error saving global token:', updateError);
        throw new Error('Failed to save global refresh token');
      }
    } else {
        console.warn('No refresh token received. User might need to revoke access or use prompt=consent.');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in auth callback:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
