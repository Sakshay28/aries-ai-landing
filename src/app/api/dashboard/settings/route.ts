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

// The placeholder the GET handler substitutes for a stored secret. A PATCH that
// echoes it back means "leave the stored value alone" — never write it.
const SECRET_MASK = '••••••••';

// Any all-bullets string is treated as the mask, not as a new secret. The UI
// renders the mask into a password input, so a stray keystroke can change its
// length; a length-sensitive comparison would then overwrite a live token with
// a row of bullets.
function isMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && /^•+$/.test(value);
}

// Columns that exist only after a later migration has been applied. Selecting or
// writing one before its migration runs is a hard PostgREST error, so both
// handlers below drop the offending column and retry rather than failing wholesale.
const BASE_COLS = [
  'business_name', 'business_type', 'business_phone', 'business_address',
  'business_website', 'business_email', 'bot_name', 'bot_personality',
  'welcome_message', 'welcome_offer', 'usps', 'working_hours',
  'staff_phone', 'staff_name', 'manager_phone', 'staff_email', 'escalation_alert_template',
  'escalation_enabled', 'escalation_keywords', 'escalation_reply',
  'followup_30min', 'followup_3hr', 'followup_24hr', 'followup_7day',
  'escalation_timeout_mins', 'hot_keywords', 'warm_keywords',
  'custom_faqs', 'off_hours_enabled', 'off_hours_message', 'off_hours_capture_lead',
  'google_review_url', 'review_automation_enabled',
  'wa_phone_number_id', 'wa_business_account_id', 'wa_access_token', 'wa_app_secret', 'wa_verify_token',
  'outbound_webhook_url', 'system_prompt',
];

const OPT_COLS = [
  'wa_mode', 'coexistence_auto_pause', 'coexistence_connected_at', 'welcome_image_url',
  'bot_language_mode', 'response_length', 'prohibited_topics', 'always_mention_rules',
  'competitors', 'competitor_deflection_reply', 'booking_alert_template',
  'default_lead_assignee_id', 'lead_assigned_email_template', 'media_rules',
  'service_disabled', 'service_disabled_message', 'bot_paused_auto_resume_hours',
];

// Postgres and PostgREST report a missing column two different ways depending on
// whether it appeared in a select list or in a write payload:
//   42703    → `column tenants.bot_paused_auto_resume_hours does not exist`
//   PGRST204 → `Could not find the 'x' column of 'tenants' in the schema cache`
// Pull the column name out of either so the caller can drop exactly that field
// and retry. Dropping the whole optional set instead (the previous behaviour) is
// what silently stripped 17 fields from every GET when one migration was pending.
function missingColumnFrom(error: { message?: string } | null | undefined): string | null {
  const msg = error?.message || '';
  const match =
    msg.match(/column\s+(?:[a-z0-9_]+\.)?"?([a-z0-9_]+)"?\s+does not exist/i) ||
    msg.match(/could not find the '([a-z0-9_]+)' column/i);
  return match ? match[1] : null;
}

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Retry without whichever optional column the DB rejects, one at a time, so a
  // single un-run migration can't blank out every other optional field. Bounded
  // by the optional-column count — each pass removes exactly one candidate.
  let optional = [...OPT_COLS];
  const pendingMigrationFields: string[] = [];
  let data: Record<string, unknown> | null = null;
  let error: { message?: string } | null = null;

  for (let attempt = 0; attempt <= OPT_COLS.length; attempt++) {
    ({ data, error } = await supabaseAdmin
      .from('tenants')
      .select([...BASE_COLS, ...optional].join(', '))
      .eq('id', tenantId)
      .single() as { data: Record<string, unknown> | null; error: { message?: string } | null });

    if (!error) break;

    const missing = missingColumnFrom(error);
    if (!missing || !optional.includes(missing)) break;

    optional = optional.filter(col => col !== missing);
    pendingMigrationFields.push(missing);
  }

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (pendingMigrationFields.length > 0) {
    console.warn(
      `⚠️ tenants is missing column(s) [${pendingMigrationFields.join(', ')}] — a migration is pending. ` +
      `Settings for those fields are unavailable until it runs.`
    );
  }

  // Mask sensitive credentials
  if (data && data.wa_access_token) {
    data.wa_access_token = SECRET_MASK;
  }
  if (data && data.wa_app_secret) {
    data.wa_app_secret = SECRET_MASK;
  }

  return NextResponse.json({ success: true, data, pendingMigrationFields });
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

  // bot_paused_auto_resume_hours: null clears the opt-in; otherwise require a
  // non-negative finite integer under a sane ceiling (~1 year) so a fat-finger
  // "72000" doesn't silently disable the feature by pushing the threshold past
  // any realistic conversation age.
  if (body.bot_paused_auto_resume_hours !== undefined && body.bot_paused_auto_resume_hours !== null) {
    const n = Number(body.bot_paused_auto_resume_hours);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 8760) {
      return NextResponse.json(
        { success: false, error: 'bot_paused_auto_resume_hours must be an integer between 0 and 8760 (or null).' },
        { status: 400 }
      );
    }
    // 0 is stored as-is; the webhook decision helper treats 0 the same as null
    // (never auto-resume), so keeping the literal write is fine.
    body.bot_paused_auto_resume_hours = n;
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
    'escalation_timeout_mins', 'bot_paused_auto_resume_hours',
    'hot_keywords', 'warm_keywords',
    'custom_faqs', 'off_hours_enabled', 'off_hours_message', 'off_hours_capture_lead',
    'google_review_url', 'review_automation_enabled',
    'wa_phone_number_id', 'wa_business_account_id', 'wa_verify_token',
    // wa_mode is set by onboarding (not user-editable here); the auto-pause
    // behaviour for coexistence IS toggleable.
    'coexistence_auto_pause',
    'outbound_webhook_url', 'system_prompt',
    // AI Behavior Controls (migration 20260618)
    'bot_language_mode', 'response_length', 'prohibited_topics',
    'always_mention_rules', 'competitors', 'competitor_deflection_reply',
    'default_lead_assignee_id', 'lead_assigned_email_template',
    // Media Rules (migration 20260719)
    'media_rules',
    // Service-disabled kill switch (migration 20260720)
    'service_disabled', 'service_disabled_message',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  // Nullable UUID columns: the UI models "nobody selected" as the empty string
  // (an <option value="">), and JSON has no way to distinguish that from a real
  // id. Postgres rejects '' for a uuid with 22P02 and aborts the ENTIRE update,
  // so one unset dropdown used to discard every other field in the save.
  for (const idField of ['default_lead_assignee_id'] as const) {
    if (updates[idField] === '') {
      updates[idField] = null;
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
    if (isMaskedSecret(body.wa_access_token)) {
      // Untouched by the user — leave the existing encrypted token in the DB.
      delete updates.wa_access_token;
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
    if (isMaskedSecret(body.wa_app_secret)) {
      // Untouched by the user — leave the existing encrypted secret in the DB.
      delete updates.wa_app_secret;
    } else if (body.wa_app_secret === '' || body.wa_app_secret === null) {
      updates.wa_app_secret = null;
    } else {
      updates.wa_app_secret = encryptToken(String(body.wa_app_secret).trim());
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  // Return exactly the column set GET returns — never `select()`, which would
  // ship every tenant column (shopify_access_token, meta_ads_app_secret,
  // ig_access_token, api_key, …) back to the browser. The client re-seeds its
  // form from this row, so the shapes must match.
  let optional = [...OPT_COLS];
  const payload = { ...updates };
  const pendingMigrationFields: string[] = [];
  let data: Record<string, unknown> | null = null;
  let error: { message?: string; code?: string } | null = null;

  // Each pass removes exactly one column the DB doesn't have (from the payload,
  // the returning list, or both), so this terminates in at most one pass per
  // optional column.
  for (let attempt = 0; attempt <= OPT_COLS.length; attempt++) {
    ({ data, error } = await supabaseAdmin
      .from('tenants')
      .update(payload)
      .eq('id', tenantId)
      .select([...BASE_COLS, ...optional].join(', '))
      .maybeSingle() as {
        data: Record<string, unknown> | null;
        error: { message?: string; code?: string } | null;
      });

    if (!error) break;

    const missing = missingColumnFrom(error);
    if (!missing || !OPT_COLS.includes(missing)) break;

    optional = optional.filter(col => col !== missing);
    if (missing in payload) {
      delete payload[missing];
      pendingMigrationFields.push(missing);
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Every field in this save targets a column that does not exist yet (${pendingMigrationFields.join(', ')}). Run the pending database migration and try again.`,
        },
        { status: 503 }
      );
    }
  }

  if (error) {
    // A duplicate wa_phone_number_id is a real operator mistake (two tenants
    // pointed at the same Meta number), not an internal fault — say so plainly
    // instead of surfacing the raw index name.
    if (error.code === '23505' && /wa_phone/i.test(error.message || '')) {
      return NextResponse.json(
        { success: false, error: 'That WhatsApp Phone Number ID is already connected to another account on this platform.' },
        { status: 409 }
      );
    }
    console.error(`Settings PATCH failed for tenant ${tenantId}:`, error.code, error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // maybeSingle() returns null rather than erroring when the filter matched no
  // rows. Never report success on a write that changed nothing.
  if (!data) {
    console.error(`Settings PATCH matched 0 rows for tenant ${tenantId}`);
    return NextResponse.json(
      { success: false, error: 'Settings were not saved: no account row matched your session. Sign out and back in, then try again.' },
      { status: 404 }
    );
  }

  // Invalidate ALL cached context (tenant config, app secrets, RAG, prompts) so
  // changes take effect on the VERY NEXT message — zero stale context.
  await invalidateTenantAllCaches(tenantId);
  console.log(`🟢 Publish complete: all caches flushed for tenant ${tenantId}`);

  // Mask tokens on response
  if (data.wa_access_token) {
    data.wa_access_token = SECRET_MASK;
  }
  if (data.wa_app_secret) {
    data.wa_app_secret = SECRET_MASK;
  }

  return NextResponse.json({ success: true, data, pendingMigrationFields });
}
