import { createClient } from '@supabase/supabase-js';

// Note: This client should ONLY be used in server-side API routes.
// NEVER use this in client-side components.
export const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is missing. Global settings retrieval will fail.');
    // Fallback to anon key just to avoid crash, but logic will fail if RLS is strict
    return createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }

  return createClient(supabaseUrl, serviceRoleKey);
};
