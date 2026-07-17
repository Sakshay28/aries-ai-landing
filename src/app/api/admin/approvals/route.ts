// Platform-admin only: list & approve pending tenant signups.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { logAudit } from '@/lib/audit/logger';

export async function GET() {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name, plan, created_at')
    .eq('is_approved', false)
    .order('created_at', { ascending: false });

  // Attach an owner/contact email per tenant.
  const ids = (tenants || []).map(t => t.id);
  const owners: Record<string, string> = {};
  if (ids.length) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('tenant_id, email, role')
      .in('tenant_id', ids);
    for (const u of users || []) {
      if (!owners[u.tenant_id] || u.role === 'owner') owners[u.tenant_id] = u.email;
    }
  }

  return NextResponse.json({
    success: true,
    tenants: (tenants || []).map(t => ({ ...t, owner_email: owners[t.id] || '' })),
  });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tenant_id, action } = await req.json();
  if (!tenant_id) return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 });

  if (action === 'reject') {
    // Safety: only a still-pending signup can be rejected — never delete a live tenant.
    const { data: t } = await supabaseAdmin
      .from('tenants')
      .select('is_approved')
      .eq('id', tenant_id)
      .single();
    if (t && t.is_approved === false) {
      await supabaseAdmin.from('tenants').delete().eq('id', tenant_id).eq('is_approved', false);
    }
    return NextResponse.json({ success: true });
  }

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ is_approved: true })
    .eq('id', tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    tenant_id,
    actor_id: me.id,
    actor_email: me.email,
    action: 'platform_admin_approved_signup',
    entity: 'tenant',
    entity_id: tenant_id,
  });

  return NextResponse.json({ success: true });
}
