// ═══════════════════════════════════════════════════════════
// ⚙️ Settings API — Save Bot Configuration to Supabase
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getCurrentUser, canManageTeam } from '@/lib/auth/getCurrentUser';
import { encryptToken } from '@/lib/utils/crypto';
import { isSafeWebhookUrl } from '@/lib/utils/ssrf';

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
      staff_phone, staff_name, manager_phone, escalation_alert_template,
      escalation_enabled, escalation_keywords, escalation_reply,
      followup_30min, followup_3hr, followup_24hr, followup_7day,
      escalation_timeout_mins, hot_keywords, warm_keywords,
      custom_faqs, off_hours_enabled, off_hours_message, off_hours_capture_lead,
      google_review_url, review_automation_enabled,
      wa_phone_number_id, wa_business_account_id, wa_access_token, wa_app_secret, wa_verify_token,
      outbound_webhook_url, system_prompt
    `)
    .eq('id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Mask sensitive credentials
  if (data && data.wa_access_token) {
    data.wa_access_token = '••••••••';
  }
  if (data && data.wa_app_secret) {
    data.wa_app_secret = '••••••••';
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/dashboard/settings — Update settings
export async function PATCH(req: NextRequest) {
  // Role gate: changing bot config / webhook / WhatsApp credentials is an
  // owner/admin action. Staff & viewer members must not be able to repoint
  // the outbound webhook, poison the system prompt, or swap WA credentials.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageTeam(user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions' }, { status: 403 });
  }
  const tenantId = user.tenant_id;

  const body = await req.json();

  // Guard: limit system_prompt length to prevent prompt-flooding attacks
  if (body.system_prompt !== undefined && body.system_prompt !== null) {
    const promptStr = String(body.system_prompt);
    if (promptStr.length > 4000) {
      return NextResponse.json(
        { success: false, error: 'system_prompt exceeds the 4,000-character limit.' },
        { status: 400 }
      );
    }
  }

  // SSRF guard: reject an unsafe outbound_webhook_url before persisting it.
  if (
    body.outbound_webhook_url !== undefined &&
    body.outbound_webhook_url !== null &&
    body.outbound_webhook_url !== '' &&
    !isSafeWebhookUrl(body.outbound_webhook_url)
  ) {
    return NextResponse.json(
      { success: false, error: 'Outbound webhook URL must be a public HTTPS address.' },
      { status: 400 }
    );
  }

  // Whitelist allowed fields to prevent updating sensitive data
  const allowedFields = [
    'business_name', 'business_type', 'business_phone', 'business_address',
    'business_website', 'business_email', 'bot_name', 'bot_personality',
    'welcome_message', 'welcome_offer', 'usps', 'working_hours',
    'staff_phone', 'staff_name', 'manager_phone', 'escalation_alert_template',
    'escalation_enabled', 'escalation_keywords', 'escalation_reply',
    'followup_30min', 'followup_3hr', 'followup_24hr', 'followup_7day',
    'escalation_timeout_mins', 'hot_keywords', 'warm_keywords',
    'custom_faqs', 'off_hours_enabled', 'off_hours_message', 'off_hours_capture_lead',
    'google_review_url', 'review_automation_enabled',
    'wa_phone_number_id', 'wa_business_account_id', 'wa_verify_token',
    'outbound_webhook_url', 'system_prompt'
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  // Handle encrypted access token specifically
  if (body.wa_access_token !== undefined) {
    if (body.wa_access_token === '••••••••') {
      // Do nothing, do not overwrite the existing encrypted token in DB
    } else if (body.wa_access_token === '' || body.wa_access_token === null) {
      updates.wa_access_token = null;
    } else {
      // Encrypt the new token using AES-256-GCM
      updates.wa_access_token = encryptToken(body.wa_access_token);
    }
  }

  // Handle encrypted app secret (same pattern as access token)
  if (body.wa_app_secret !== undefined) {
    if (body.wa_app_secret === '••••••••') {
      // Do nothing, do not overwrite existing encrypted secret
    } else if (body.wa_app_secret === '' || body.wa_app_secret === null) {
      updates.wa_app_secret = null;
    } else {
      updates.wa_app_secret = encryptToken(body.wa_app_secret);
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

  // Invalidate ALL cached context (tenant config, app secrets, RAG, prompts) so
  // changes take effect on the VERY NEXT message — zero stale context.
  await invalidateTenantAllCaches(tenantId);
  console.log(`🟢 Publish complete: all caches flushed for tenant ${tenantId}`);

  // Mask tokens on response
  if (data && data.wa_access_token) {
    data.wa_access_token = '••••••••';
  }
  if (data && data.wa_app_secret) {
    data.wa_app_secret = '••••••••';
  }

  return NextResponse.json({ success: true, data });
}
