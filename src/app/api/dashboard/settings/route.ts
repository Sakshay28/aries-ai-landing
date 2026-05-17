// ═══════════════════════════════════════════════════════════
// ⚙️ Settings API — Save Bot Configuration to Supabase
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateCache } from '@/lib/tenant/manager';
import { getTenantId } from '@/lib/auth/getTenantId';
import { encryptToken, decryptToken } from '@/lib/utils/crypto';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      business_name, business_type, business_phone, business_address,
      business_website, business_email, bot_name, bot_personality,
      welcome_message, welcome_offer, usps, working_hours,
      staff_phone, staff_name, manager_phone,
      followup_30min, followup_3hr, followup_24hr, followup_7day,
      escalation_timeout_mins, hot_keywords, warm_keywords,
      custom_faqs, off_hours_message, off_hours_capture_lead,
      gupshup_api_key, gupshup_phone_number, gupshup_app_name
    `)
    .eq('id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Decrypt the gupshup_api_key before returning to the dashboard owner.
  // The tenant owner is allowed to see their own key (so the Settings UI can
  // re-display it as a masked password input). decryptToken is a no-op on
  // legacy plaintext values.
  if (data && data.gupshup_api_key) {
    data.gupshup_api_key = decryptToken(data.gupshup_api_key as string);
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/dashboard/settings — Update settings
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Whitelist allowed fields to prevent updating sensitive data
  const allowedFields = [
    'business_name', 'business_type', 'business_phone', 'business_address',
    'business_website', 'business_email', 'bot_name', 'bot_personality',
    'welcome_message', 'welcome_offer', 'usps', 'working_hours',
    'staff_phone', 'staff_name', 'manager_phone',
    'followup_30min', 'followup_3hr', 'followup_24hr', 'followup_7day',
    'escalation_timeout_mins', 'hot_keywords', 'warm_keywords',
    'custom_faqs', 'off_hours_message', 'off_hours_capture_lead',
    'gupshup_api_key', 'gupshup_phone_number', 'gupshup_app_name'
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  // Encrypt sensitive fields at rest. encryptToken is idempotent — it skips
  // values already prefixed with `enc:v1:`, so re-saving a previously-encrypted
  // value (e.g. user opens settings and clicks Save without retyping the key)
  // will not double-encrypt.
  if (typeof updates.gupshup_api_key === 'string') {
    if (!updates.gupshup_api_key.trim()) {
      // Empty string means "don't change" — drop it from updates so we keep
      // the existing encrypted value in the DB.
      delete updates.gupshup_api_key;
    } else {
      updates.gupshup_api_key = encryptToken(updates.gupshup_api_key as string);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Invalidate cached tenant config so changes take effect immediately
  await invalidateCache(tenantId);

  return NextResponse.json({ success: true, data });
}
