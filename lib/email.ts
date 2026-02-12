
import { google } from 'googleapis';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getOAuth2Client } from '@/lib/drive';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const supabaseAdmin = getSupabaseAdmin();
  
  // Fetch Google Refresh Token
  const { data: settings, error } = await supabaseAdmin
    .from('system_settings')
    .select('key, value')
    .eq('key', 'google_refresh_token')
    .single();

  if (error || !settings || !settings.value) {
    console.warn('Google Refresh Token not found. Skipping email.');
    return false;
  }

  const refreshToken = settings.value;

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: 'v1', auth });

    // Construct raw email
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      html
    ];
    const message = messageParts.join('\n');

    // The message needs to be base64url encoded
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log('Message sent via Gmail API:', res.data.id);
    return true;
  } catch (err) {
    console.error('Error sending email via Gmail API:', err);
    throw err;
  }
}
