// ═══════════════════════════════════════════════════════════
// 🛠️ Platform-Admin: Provision / Onboard a client tenant
// ═══════════════════════════════════════════════════════════
// Lets a PLATFORM ADMIN fill in any tenant's WhatsApp credentials +
// business details on the client's behalf — without logging in as
// that client. Every handler independently verifies is_platform_admin
// (server-side, against a Supabase-verified JWT), so the URL is useless
// to anyone else even if discovered.
//
//   GET  /api/admin/provision              → list all tenants
//   GET  /api/admin/provision?tenant_id=X  → one tenant's settings (masked)
//   PATCH /api/admin/provision             → update tenant X's fields
//   DELETE /api/admin/provision            → hard-delete tenant X (+ all data)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { encryptToken } from '@/lib/utils/crypto';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { trimCredentialFields } from '@/lib/utils/credentials';
import { logAudit } from '@/lib/audit/logger';
import { notifyAdmin } from '@/lib/alerts/admin';

const forbidden = () => NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

// Fields a platform admin may set on a tenant. Mirrors the self-serve
// settings whitelist so we never write columns that aren't meant to be edited.
const ALLOWED_FIELDS = [
  'business_name', 'business_type', 'business_phone', 'business_address',
  'business_website', 'business_email', 'bot_name', 'bot_personality',
  'welcome_message', 'welcome_offer', 'usps', 'working_hours',
  'staff_phone', 'staff_name', 'manager_phone',
  'off_hours_enabled', 'off_hours_message',
  'google_review_url', 'review_automation_enabled',
  'wa_phone_number_id', 'wa_business_account_id', 'wa_verify_token',
  'parent_tenant_id',
];

const MASK = '••••••••';

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const tenantId = req.nextUrl.searchParams.get('tenant_id');

  // ── Single tenant (for the edit form) ──
  if (tenantId) {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select(`
        id, business_name, business_type, business_phone, business_address,
        business_website, business_email, bot_name, bot_personality,
        welcome_message, welcome_offer, usps, working_hours,
        staff_phone, staff_name, manager_phone,
        off_hours_enabled, off_hours_message,
        google_review_url, review_automation_enabled,
        wa_phone_number_id, wa_business_account_id, wa_access_token,
        wa_app_secret, wa_verify_token, is_approved, parent_tenant_id
      `)
      .eq('id', tenantId)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: error?.message || 'Not found' }, { status: 404 });
    }

    // Never send secrets to the browser — mask them.
    if (data.wa_access_token) data.wa_access_token = MASK;
    if (data.wa_app_secret) data.wa_app_secret = MASK;

    // Surfaced on the client's own Audit Log page — proves access, doesn't just promise it.
    logAudit({
      tenant_id: tenantId,
      actor_id: me.id,
      actor_email: me.email,
      action: 'platform_admin_viewed_credentials',
      entity: 'tenant_settings',
      entity_id: tenantId,
    });

    // Attach the owner email for context.
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('email, role')
      .eq('tenant_id', tenantId);
    const owner = (users || []).find(u => u.role === 'owner') || (users || [])[0];

    return NextResponse.json({ success: true, tenant: { ...data, owner_email: owner?.email || '' } });
  }

  // ── List all tenants (picker) ──
  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name, plan, created_at, is_approved, wa_phone_number_id, parent_tenant_id')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

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
    tenants: (tenants || []).map(t => ({
      id: t.id,
      business_name: t.business_name,
      plan: t.plan,
      created_at: t.created_at,
      is_approved: t.is_approved,
      owner_email: owners[t.id] || '',
      wa_configured: Boolean(t.wa_phone_number_id),
      parent_tenant_id: t.parent_tenant_id || null,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
  }

  const tenantId = body.tenant_id;
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ success: false, error: 'tenant_id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Trim stray whitespace from credential IDs — a leading/trailing space gets
  // URL-encoded to %20 in Meta Graph API calls and silently breaks them.
  trimCredentialFields(updates);

  // Encrypt the access token + app secret exactly like the self-serve settings
  // route: skip if masked (unchanged), null if cleared, encrypt if new.
  // Trim the plaintext first — a stray space breaks Bearer auth / HMAC too.
  for (const secretField of ['wa_access_token', 'wa_app_secret'] as const) {
    if (body[secretField] === undefined) continue;
    const val = body[secretField];
    if (val === MASK) continue; // unchanged — keep existing ciphertext
    if (val === '' || val === null) { updates[secretField] = null; continue; }
    updates[secretField] = encryptToken(String(val).trim());
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  // Confirm the tenant exists before writing (clearer error than a silent no-op).
  const { data: exists } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .single();
  if (!exists) {
    return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('tenants').update(updates).eq('id', tenantId);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Flush caches so the bot picks up the new credentials on the very next message.
  await invalidateTenantAllCaches(tenantId);
  console.log(`🟢 [admin/provision] tenant ${tenantId} updated by ${me.email}`);

  // Log which fields changed, never the values — secret fields are only ever
  // stored encrypted, and this log should never become a second place they leak.
  logAudit({
    tenant_id: tenantId,
    actor_id: me.id,
    actor_email: me.email,
    action: 'platform_admin_edited_tenant',
    entity: 'tenant_settings',
    entity_id: tenantId,
    new_value: Object.keys(updates),
  });

  return NextResponse.json({ success: true });
}

// ═══════════════════════════════════════════════════════════
// 🗑️ Hard-delete a tenant and everything it owns.
// ═══════════════════════════════════════════════════════════
// Irreversible. Every child table FK references tenants ON DELETE CASCADE,
// so removing the row cascades messages/conversations/leads/bookings/
// broadcasts/etc. We additionally clean up the orphaned Supabase auth.users
// logins for that tenant's members — but never the acting admin's own login,
// and never any platform admin's login (they may belong to other tenants).
//
// Guard: the caller must echo back the exact business_name in `confirm_name`,
// so a stray request can't nuke the wrong tenant.
export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const body = await req.json().catch(() => null);
  const tenantId = body?.tenant_id;
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ success: false, error: 'tenant_id is required' }, { status: 400 });
  }

  // Load the tenant so we can (a) confirm it exists and (b) verify the name echo.
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name')
    .eq('id', tenantId)
    .single();
  if (!tenant) {
    return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
  }

  // Typed-name confirmation — the client sends what the admin typed. Compare
  // trimmed; treat an unnamed tenant's expected value as the literal 'Unnamed'.
  const expected = (tenant.business_name || 'Unnamed').trim();
  if (typeof body?.confirm_name !== 'string' || body.confirm_name.trim() !== expected) {
    return NextResponse.json(
      { success: false, error: `Confirmation text must exactly match the business name ("${expected}").` },
      { status: 400 },
    );
  }

  // Capture the tenant's auth logins BEFORE the cascade removes public.users.
  const { data: members } = await supabaseAdmin
    .from('users')
    .select('id, email, is_platform_admin')
    .eq('tenant_id', tenantId);

  // Delete the tenant row — cascades through all tenant-scoped tables.
  const { error: delErr } = await supabaseAdmin.from('tenants').delete().eq('id', tenantId);
  if (delErr) {
    return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
  }

  // Best-effort auth cleanup. Skip the acting admin and any platform admin so we
  // never lock ourselves (or another operator) out. Non-fatal on failure.
  let authDeleted = 0;
  for (const u of members || []) {
    if (u.id === me.id || u.is_platform_admin) continue;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
    if (!error) authDeleted++;
  }

  await invalidateTenantAllCaches(tenantId);
  console.log(`🗑️ [admin/provision] tenant ${tenantId} ("${expected}") hard-deleted by ${me.email}`);

  // The tenant's own audit_logs cascade away with it, so record this out-of-band
  // (email + Sentry) — the only durable trail of who removed which client.
  await notifyAdmin({
    dedupeKey: `tenant-deleted-${tenantId}`,
    subject: `Client hard-deleted: ${expected}`,
    summary: `Platform admin ${me.email} permanently deleted tenant "${expected}" (${tenantId}) and all its data. ${authDeleted} auth login(s) removed.`,
    context: { tenant_id: tenantId, business_name: expected, actor: me.email, auth_logins_removed: authDeleted },
  }).catch(() => {});

  return NextResponse.json({ success: true, auth_logins_removed: authDeleted });
}
