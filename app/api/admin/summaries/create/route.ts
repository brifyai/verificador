
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { title, clientEmail, clientPassword, verificationIds } = await req.json();

    if (!title || !clientEmail || !verificationIds || verificationIds.length === 0) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let clientId;

    // 1. Check if Client exists in Profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', clientEmail)
      .single();

    if (existingProfile) {
      clientId = existingProfile.id;
    } else {
        // Create new user
        if (!clientPassword) return NextResponse.json({ error: 'Password required for new client' }, { status: 400 });
        
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: clientEmail,
            password: clientPassword,
            email_confirm: true
        });
        
        if (createError) {
            // Handle case where user exists in Auth but not in Profiles (shouldn't happen with trigger, but just in case)
            if (createError.message.includes('already registered')) {
                // Try to find user ID via listUsers as fallback (expensive but safe)
                // Or just error out saying "User exists but profile missing"
                throw new Error("El usuario ya existe en Auth pero no se encontró perfil. Contacte soporte.");
            }
            throw createError;
        }
        
        clientId = newUser.user!.id;
        
        // Ensure Profile is created/updated (Trigger does it, but upsert ensures role)
        // Wait briefly for trigger or just upsert
        await supabaseAdmin.from('profiles').upsert({
            id: clientId,
            email: clientEmail,
            role: 'client'
        });
    }

    // 2. Fetch Verification Data for Snapshot
    const { data: verifications, error: fetchError } = await supabaseAdmin
        .from('verifications')
        .select(`
            id, target_phrase, is_match, validation_rate, 
            timestamp_start, timestamp_end, 
            transcription, full_transcription,
            created_at, audio_path,
            drive_folder_name, drive_parent_folder_id, batch_id, broadcast_time, broadcast_date,
            radios (name, drive_folder_id),
            batch_jobs (name)
        `)
        .in('id', verificationIds);

    if (fetchError) throw fetchError;

    // 3. Create Summary
    const { error: summaryError } = await supabaseAdmin
        .from('summaries')
        .insert({
            created_by: user.id,
            client_id: clientId,
            title: title,
            data: verifications // Store full snapshot
        });

    if (summaryError) throw summaryError;

    // Send Email Notification
    const appUrl = 'https://verificador-self.vercel.app';
    const creatorEmail = user.email;

    let emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Nuevo Resumen Disponible</h2>
            <p>El administrador <strong>${creatorEmail}</strong> te ha invitado a revisar un nuevo resumen de verificaciones: <strong>${title}</strong>.</p>
    `;

    if (clientPassword) {
        emailHtml += `
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Se ha creado una cuenta para ti:</strong></p>
                <p style="margin: 5px 0;">Email: ${clientEmail}</p>
                <p style="margin: 5px 0;">Contraseña: ${clientPassword}</p>
            </div>
        `;
    }

    emailHtml += `
            <p>Puedes acceder al resumen aquí: <a href="${appUrl}/dashboard/client-summary">${appUrl}/dashboard/client-summary</a></p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">Si es tu primera vez ingresando, te recomendamos cambiar tu contraseña.</p>
        </div>
    `;

    await sendEmail({
        to: clientEmail,
        subject: `Nuevo Resumen de Verificación: ${title}`,
        html: emailHtml
    }).catch(err => console.error('Error sending client summary email:', err));

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Create Summary Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
