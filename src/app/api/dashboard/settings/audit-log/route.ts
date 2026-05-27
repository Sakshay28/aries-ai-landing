import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('id, actor_email, action, entity, entity_id, old_value, new_value, ip_address, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
