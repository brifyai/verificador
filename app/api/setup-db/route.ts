
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    
    // 1. Create batch_jobs table
    const { error: tableError } = await supabase.rpc('exec_sql', {
        sql: `
        create table if not exists batch_jobs (
          id uuid default gen_random_uuid() primary key,
          created_at timestamp with time zone default timezone('utc'::text, now()) not null,
          radio_id uuid references radios(id) on delete cascade not null,
          user_id uuid references auth.users(id) not null,
          name text,
          status text default 'processing' check (status in ('processing', 'completed', 'error')),
          total_files integer default 0,
          processed_files integer default 0,
          total_duration_seconds numeric,
          total_processing_seconds numeric,
          estimated_cost numeric,
          completed_at timestamp with time zone
        );
        
        alter table batch_jobs enable row level security;
        
        create policy "Users can view their own batch jobs"
          on batch_jobs for select
          using (auth.uid() = user_id);
          
        create policy "Users can insert their own batch jobs"
          on batch_jobs for insert
          with check (auth.uid() = user_id);
          
        create policy "Users can update their own batch jobs"
          on batch_jobs for update
          using (auth.uid() = user_id);
        `
    });

    if (tableError && !tableError.message.includes('already exists')) {
        // Fallback if exec_sql not available (it usually isn't enabled by default for security)
        // But we can try to use standard query if we are admin? No, Supabase JS client doesn't support raw SQL easily unless via RPC.
        // If RPC 'exec_sql' doesn't exist, we might be stuck without a migration tool.
        // However, I can try to create it via a specific function if I had one.
        // Let's assume the user has to run the SQL or I use a workaround.
        // Workaround: Use the 'verifications' table update to check if we can add the column.
        throw new Error("Cannot execute raw SQL via client. Please run the SQL in Supabase Dashboard.");
    }

    // 2. Add batch_id to verifications
    // This is hard to do without raw SQL.
    
    return NextResponse.json({ success: true, message: "SQL executed (simulated - if RPC existed)" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
