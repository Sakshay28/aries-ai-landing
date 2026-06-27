import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getTenantById } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { toSignedMediaUrl } from '@/lib/utils/storage';
import { sendTextMessage, sendMediaMessage } from '@/lib/meta/service';
import { evaluateConditions, pickVariant } from '@/lib/automations/logic';
import { tenantSampleData, renderTemplate } from '@/lib/automations/preview';

// POST /api/dashboard/automations/test
// Two modes (L2):
//   dry_run=true  → render + validate + show which A/B variant and whether the
//                   conditions pass, WITHOUT sending anything.
//   dry_run=false → actually send the rendered message to `to_phone` so the
//                   owner can preview it on their own WhatsApp.
//
// Source can be a saved automation (automation_id) or an unsaved draft (so the
// editor can "Send test" before the automation is created).
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run !== false; // default to safe dry-run
  const toPhone: string | undefined = body.to_phone?.trim();

  // ── Resolve the automation source ──
  let src: {
    message_text: string;
    message_text_b?: string | null;
    ab_split_percent?: number | null;
    conditions?: any;
    media_url?: string | null;
    media_type?: string | null;
  };

  if (body.automation_id) {
    const { data, error } = await supabaseAdmin
      .from('automations')
      .select('message_text, message_text_b, ab_split_percent, conditions, media_url, media_type')
      .eq('id', body.automation_id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    src = data;
  } else {
    if (!body.message_text?.trim()) return NextResponse.json({ error: 'message_text or automation_id required' }, { status: 400 });
    src = {
      message_text: body.message_text,
      message_text_b: body.message_text_b ?? null,
      ab_split_percent: body.ab_split_percent ?? 0,
      conditions: body.conditions ?? null,
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? null,
    };
  }

  // ── Build variables from the tenant's real sample data + any overrides ──
  const vars = { ...(await tenantSampleData(tenantId)), ...(body.variables || {}) };

  // ── Condition gate (uses the SAME logic as the engine) ──
  const cond = evaluateConditions(src.conditions ?? null, vars);

  // ── A/B variant (keyed by to_phone for a realistic test, else a sample key) ──
  const picked = pickVariant(
    { message_text: src.message_text, message_text_b: src.message_text_b, ab_split_percent: src.ab_split_percent },
    toPhone || vars.customer_phone || 'test',
  );

  const { rendered, unresolved, unknownKeys } = renderTemplate(picked.text, vars);

  // ── Dry run: report only ──
  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      rendered,
      variant: picked.variant,
      condition_passed: cond.passed,
      condition_reason: cond.reason ?? null,
      unresolved,
      unknown_variables: unknownKeys,
      valid: unresolved.length === 0 && unknownKeys.length === 0,
      would_send: cond.passed && unresolved.length === 0,
    });
  }

  // ── Real send ──
  if (!toPhone) return NextResponse.json({ error: 'to_phone is required to send a test' }, { status: 400 });
  if (!cond.passed) {
    return NextResponse.json({ error: `Conditions not met for the sample data — message would be skipped. (${cond.reason})` }, { status: 422 });
  }
  if (unresolved.length > 0) {
    return NextResponse.json({ error: `Unresolved variables: ${unresolved.join(', ')}` }, { status: 422 });
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant || !tenant.wa_access_token || !tenant.wa_phone_number_id) {
    return NextResponse.json({ error: 'WhatsApp is not connected for this tenant' }, { status: 400 });
  }

  try {
    const token = decryptToken(tenant.wa_access_token) as string;
    const phoneNumberId = tenant.wa_phone_number_id;
    let messageId: string | null = null;

    if (src.media_url) {
      const signedUrl = await toSignedMediaUrl(src.media_url);
      const mediaType = (src.media_type || 'image') as 'image' | 'video' | 'document';
      const result = await sendMediaMessage(token, phoneNumberId, toPhone, mediaType, signedUrl, rendered);
      messageId = result?.messageId ?? null;
    } else {
      const result = await sendTextMessage(token, phoneNumberId, toPhone, rendered);
      messageId = result?.messageId ?? null;
    }

    return NextResponse.json({ sent: true, message_id: messageId, variant: picked.variant, rendered });
  } catch (err) {
    const msg = (err as Error).message || 'Send failed';
    // The owner's own number often won't have an open 24h window — explain that.
    const friendly = /131047|24 hours/.test(msg)
      ? 'WhatsApp blocked the test: your test number must have messaged this WhatsApp business number within the last 24 hours. Send any message to the business number first, then retry.'
      : msg;
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
