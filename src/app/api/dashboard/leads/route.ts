import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*, conversations(id), assigned_user:assigned_to(id, full_name, email)')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, leads });
}
