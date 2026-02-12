
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check Role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Only Super Admin can create users' }, { status: 403 });
    }

    const { email, password, role, assignedRadios } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Create User
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError) throw createError;
    if (!newUser.user) throw new Error('Failed to create user');

    // Update Profile Role
    // (Trigger creates default profile, we update it)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({ 
        id: newUser.user.id, 
        email: email,
        role: role 
      });
      
    if (profileError) throw profileError;

    // If Admin and assignedRadios exist
    if (role === 'admin' && assignedRadios && Array.isArray(assignedRadios) && assignedRadios.length > 0) {
      const assignments = assignedRadios.map((radioId: string) => ({
        admin_id: newUser.user!.id,
        radio_id: radioId
      }));
      
      const { error: assignError } = await supabaseAdmin
        .from('radio_assignments')
        .insert(assignments);
        
      if (assignError) throw assignError;
    }

    // Send Email Invitation
    if (role === 'admin') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        await sendEmail({
            to: email,
            subject: 'Invitación a Verificador de Medios - Administrador',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Bienvenido al Verificador de Medios</h2>
                    <p>Has sido invitado como <strong>Administrador</strong> para gestionar verificaciones de radios.</p>
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Tus credenciales de acceso:</strong></p>
                        <p style="margin: 5px 0;">Email: ${email}</p>
                        <p style="margin: 5px 0;">Contraseña: ${password}</p>
                    </div>
                    <p>Accede a la plataforma aquí: <a href="${appUrl}">${appUrl}</a></p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">Por favor cambia tu contraseña al ingresar.</p>
                </div>
            `
        }).catch(err => console.error('Error sending admin invitation email:', err));
    }

    return NextResponse.json({ success: true, user: newUser.user });

  } catch (error: any) {
    console.error("Create User Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
