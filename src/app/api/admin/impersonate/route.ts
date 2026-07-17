import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { logAudit } from '@/lib/audit/logger';

const forbidden = () => NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

// POST /api/admin/impersonate
// Body: { email: string }
// Returns a one-time Supabase magic link that logs the caller in as that user.
// Triple-gated: only reachable by is_platform_admin (server-verified JWT).
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
  }

  // Resolve which tenant this belongs to *before* generating the link, so the
  // impersonation shows up on that tenant's own Audit Log page.
  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id')
    .eq('email', email)
    .maybeSingle();

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://ariesai.in/impersonate' },
  });

  if (error || !data?.properties?.action_link) {
    console.error(`[admin/impersonate] generateLink failed for ${email}:`, error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to generate login link' },
      { status: 500 }
    );
  }

  console.log(`🔐 [admin/impersonate] ${me.email} → impersonating ${email}`);

  if (targetUser?.tenant_id) {
    logAudit({
      tenant_id: targetUser.tenant_id,
      actor_id: me.id,
      actor_email: me.email,
      action: 'platform_admin_impersonated',
      entity: 'user_session',
      entity_id: targetUser.id,
      meta: { target_email: email },
    });
  }

  return NextResponse.json({ success: true, url: data.properties.action_link });
}
