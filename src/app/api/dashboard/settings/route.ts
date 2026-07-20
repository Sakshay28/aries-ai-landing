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
import { trimCredentialFields } from '@/lib/utils/credentials';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const BASE_COLS = `
      business_name, business_type, business_phone, business_address,
      business_website, business_email, bot_name, bot_personality,
      welcome_message, welcome_offer, usps, working_hours,
      staff_phone, staff_name, manager_phone, staff_email, escalation_alert_template,
      escalation_enabled, escalation_keywords, escalation_reply,
      followup_30min, followup_3hr, followup_24hr, followup_7day,
      escalation_timeout_mins, hot_keywords, warm_keywords,
      custom_faqs, off_hours_enabled, off_hours_message, off_hours_capture_lead,
      google_review_url, review_automation_enabled,
      wa_phone_number_id, wa_business_account_id, wa_access_token, wa_app_secret, wa_verify_token,
      outbound_webhook_url, system_prompt`;
  // Optional columns added by later migrations. Select them when present;
  // fall back to BASE_COLS if the migration hasn't run yet.
  const OPT_COLS = `wa_mode, coexistence_auto_pause, coexistence_connected_at, welcome_image_url, bot_language_mode, response_length, prohibited_topics, always_mention_rules, competitors, competitor_deflection_reply, booking_alert_template, default_lead_assignee_id, lead_assigned_email_template, media_rules`;

  let { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`${BASE_COLS}, ${OPT_COLS}`)
    .eq('id', tenantId)
    .single();

  if (error && /column|does not exist/i.test(error.message || '')) {
    ({ data, error } = await supabaseAdmin
      .from('tenants')
      .select(BASE_COLS)
      .eq('id', tenantId)
      .single());
  }

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
    if (promptStr.length > 100000) {
      return NextResponse.json(
        { success: false, error: 'system_prompt exceeds the 100,000-character limit.' },
        { status: 400 }
      );
    }
  }

  // AI Behavior Controls: validate enums and cap array/string sizes so a
  // malformed payload can't poison the prompt or bloat the row.
  if (body.bot_language_mode !== undefined && body.bot_language_mode !== null &&
      !['auto', 'english', 'hindi'].includes(String(body.bot_language_mode))) {
    return NextResponse.json({ success: false, error: 'bot_language_mode must be auto, english, or hindi.' }, { status: 400 });
  }
  if (body.response_length !== undefined && body.response_length !== null &&
      !['short', 'medium', 'detailed'].includes(String(body.response_length))) {
    return NextResponse.json({ success: false, error: 'response_length must be short, medium, or detailed.' }, { status: 400 });
  }
  if (body.prohibited_topics !== undefined && body.prohibited_topics !== null) {
    if (!Array.isArray(body.prohibited_topics) || body.prohibited_topics.length > 50 ||
        body.prohibited_topics.some((t: unknown) => typeof t !== 'string' || t.length > 120)) {
      return NextResponse.json({ success: false, error: 'prohibited_topics must be up to 50 strings of 120 chars each.' }, { status: 400 });
    }
  }
  if (body.competitors !== undefined && body.competitors !== null) {
    if (!Array.isArray(body.competitors) || body.competitors.length > 50 ||
        body.competitors.some((t: unknown) => typeof t !== 'string' || t.length > 120)) {
      return NextResponse.json({ success: false, error: 'competitors must be up to 50 strings of 120 chars each.' }, { status: 400 });
    }
  }
  if (body.competitor_deflection_reply !== undefined && body.competitor_deflection_reply !== null &&
      String(body.competitor_deflection_reply).length > 500) {
    return NextResponse.json({ success: false, error: 'competitor_deflection_reply exceeds the 500-character limit.' }, { status: 400 });
  }
  if (body.always_mention_rules !== undefined && body.always_mention_rules !== null) {
    const rules = body.always_mention_rules;
    const valid = Array.isArray(rules) && rules.length <= 30 && rules.every((r: unknown) =>
      r && typeof r === 'object' &&
      typeof (r as { topic?: unknown }).topic === 'string' && (r as { topic: string }).topic.length <= 200 &&
      typeof (r as { mention?: unknown }).mention === 'string' && (r as { mention: string }).mention.length <= 400
    );
    if (!valid) {
      return NextResponse.json({ success: false, error: 'always_mention_rules must be up to 30 {topic, mention} objects.' }, { status: 400 });
    }
  }
  if (body.media_rules !== undefined && body.media_rules !== null) {
    const rules = body.media_rules;
    const valid = Array.isArray(rules) && rules.length <= 20 && rules.every((r: unknown) =>
      r && typeof r === 'object' &&
      typeof (r as { topic?: unknown }).topic === 'string' && (r as { topic: string }).topic.length <= 200 &&
      Array.isArray((r as { docIds?: unknown }).docIds) &&
      (r as { docIds: unknown[] }).docIds.length <= 10 &&
      (r as { docIds: unknown[] }).docIds.every((id: unknown) => typeof id === 'string' && id.length <= 100)
    );
    if (!valid) {
      return NextResponse.json({ success: false, error: 'media_rules must be up to 20 {topic, docIds[]} objects (max 10 files per rule).' }, { status: 400 });
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
    'welcome_message', 'welcome_image_url', 'welcome_offer', 'usps', 'working_hours',
    'staff_phone', 'staff_name', 'manager_phone', 'staff_email', 'escalation_alert_template', 'booking_alert_template',
    'escalation_enabled', 'escalation_keywords', 'escalation_reply',
    'followup_30min', 'followup_3hr', 'followup_24hr', 'followup_7day',
    'escalation_timeout_mins', 'hot_keywords', 'warm_keywords',
    'custom_faqs', 'off_hours_enabled', 'off_hours_message', 'off_hours_capture_lead',
    'google_review_url', 'review_automation_enabled',
    'wa_phone_number_id', 'wa_business_account_id', 'wa_verify_token',
    // wa_mode is set by onboarding (not user-editable here); the auto-pause
    // behaviour for coexistence echoes IS toggleable.
    'coexistence_auto_pause',
    'outbound_webhook_url', 'system_prompt',
    // AI Behavior Controls (migration 20260618)
    'bot_language_mode', 'response_length', 'prohibited_topics',
    'always_mention_rules', 'competitors', 'competitor_deflection_reply',
    'default_lead_assignee_id', 'lead_assigned_email_template',
    // Media Rules (migration 20260719)
    'media_rules',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  // Normalize keyword arrays — split comma-separated strings pasted as single entries
  for (const arrField of ['escalation_keywords', 'hot_keywords', 'warm_keywords'] as const) {
    if (Array.isArray(updates[arrField])) {
      updates[arrField] = (updates[arrField] as string[])
        .flatMap((s: string) => s.split(/,|\s{2,}/).map((k: string) => k.trim()).filter(Boolean));
    }
  }

  // Trim stray whitespace from credential IDs — a leading/trailing space gets
  // URL-encoded to %20 in Meta Graph API calls and silently breaks them.
  trimCredentialFields(updates);

  // Handle encrypted access token specifically
  if (body.wa_access_token !== undefined) {
    if (body.wa_access_token === '••••••••') {
      // Do nothing, do not overwrite the existing encrypted token in DB
    } else if (body.wa_access_token === '' || body.wa_access_token === null) {
      updates.wa_access_token = null;
    } else {
      // Encrypt the new token using AES-256-GCM (trim first — a stray space
      // breaks Bearer auth just like it breaks the plaintext IDs).
      updates.wa_access_token = encryptToken(String(body.wa_access_token).trim());
    }
  }

  // Handle encrypted app secret (same pattern as access token)
  if (body.wa_app_secret !== undefined) {
    if (body.wa_app_secret === '••••••••') {
      // Do nothing, do not overwrite existing encrypted secret
    } else if (body.wa_app_secret === '' || body.wa_app_secret === null) {
      updates.wa_app_secret = null;
    } else {
      updates.wa_app_secret = encryptToken(String(body.wa_app_secret).trim());
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  // Optional columns added by later migrations — strip them when Supabase/PostgREST
  // reports a missing column so the rest of the save still succeeds during the
  // deploy → migration window.
  // PostgREST error format: "Could not find the 'col' column of 'tenants' in the
  // schema cache" — note "column" appears but "does not exist" does NOT, so we
  // must use an OR pattern, same as the GET handler above.
  const OPTIONAL_COLS = [
    'welcome_image_url',
    'coexistence_auto_pause',
    // AI Behavior Controls (migration 20260618)
    'bot_language_mode', 'response_length', 'prohibited_topics',
    'always_mention_rules', 'competitors', 'competitor_deflection_reply',
    'default_lead_assignee_id',
    'lead_assigned_email_template',
  ];

  let { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error && /column|does not exist|schema cache/i.test(error.message || '')) {
    const stripped = { ...updates };
    for (const col of OPTIONAL_COLS) delete stripped[col];
    ({ data, error } = await supabaseAdmin
      .from('tenants')
      .update(stripped)
      .eq('id', tenantId)
      .select()
      .single());
  }

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
