import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    // Drop the recursive policy
    await supabaseAdmin.rpc('exec_sql', {
      query: `DROP POLICY IF EXISTS "Users see own tenant" ON users;`
    });

    // We can't rely on exec_sql if it doesn't exist. Let's just use raw query if we had it, but we don't.
    // Instead of RPC, we'll try a raw postgrest approach if available, but it isn't.
    // Since I am running locally, I can just write a pg client script if needed.
    
    return NextResponse.json({ message: 'Run via psql instead' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
