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
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { encryptToken } from '@/lib/utils/crypto';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';

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
        wa_app_secret, wa_verify_token, is_approved
      `)
      .eq('id', tenantId)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: error?.message || 'Not found' }, { status: 404 });
    }

    // Never send secrets to the browser — mask them.
    if (data.wa_access_token) data.wa_access_token = MASK;
    if (data.wa_app_secret) data.wa_app_secret = MASK;

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
    .select('id, business_name, plan, created_at, is_approved, wa_phone_number_id')
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

  // Encrypt the access token + app secret exactly like the self-serve settings
  // route: skip if masked (unchanged), null if cleared, encrypt if new.
  for (const secretField of ['wa_access_token', 'wa_app_secret'] as const) {
    if (body[secretField] === undefined) continue;
    const val = body[secretField];
    if (val === MASK) continue; // unchanged — keep existing ciphertext
    if (val === '' || val === null) { updates[secretField] = null; continue; }
    updates[secretField] = encryptToken(String(val));
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

  return NextResponse.json({ success: true });
}
