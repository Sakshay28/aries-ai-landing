// ═══════════════════════════════════════════════════════════
// 🩺 WhatsApp Credential Health — persistence + alerting
// ═══════════════════════════════════════════════════════════
// Server-only half of @/lib/whatsapp/credentialHealth. Split the same way as
// outbound-media / outbound-media.server so the pure classifier stays
// importable from client bundles and unit tests without dragging in
// supabaseAdmin and Resend.
//
// Contract for callers: NOTHING in here may throw into a send path. A health
// bookkeeping failure must never turn a working send into a failed one, and it
// must never stop the webhook returning 200 to Meta.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { notifyAdmin } from '@/lib/alerts/admin';
import { classifyCredentialFault, type CredentialFault } from '@/lib/whatsapp/credentialHealth';

// How long to stay quiet after alerting about an ONGOING outage. The first
// transition into "broken" always alerts immediately regardless of this.
const ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h

interface HealthRow {
  status: string;
  fault_kind: string | null;
  consecutive_failures: number;
  first_failed_at: string | null;
  last_alerted_at: string | null;
}

async function readHealth(tenantId: string): Promise<HealthRow | null> {
  const { data } = await supabaseAdmin
    .from('wa_credential_health')
    .select('status, fault_kind, consecutive_failures, first_failed_at, last_alerted_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as HealthRow | null) ?? null;
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round(((Date.now() - new Date(iso).getTime()) / 3_600_000) * 10) / 10;
}

/**
 * Records that this tenant's credentials are broken, and escalates.
 *
 * Alerting policy — the thing that actually prevents a repeat of the 25-day
 * Globesome outage:
 *   • the first time we ever see a fault for a tenant, email immediately,
 *   • a fault of a DIFFERENT kind than the last one emails immediately,
 *   • otherwise re-email at most every 6h, with the outage duration in the
 *     subject so a stale one can't blend into the noise.
 */
export async function reportCredentialFault(params: {
  tenantId: string;
  businessName?: string | null;
  phoneNumberId?: string | null;
  fault: CredentialFault;
  detail?: string | null;
}): Promise<void> {
  const { tenantId, businessName, phoneNumberId, fault, detail } = params;
  try {
    const prev = await readHealth(tenantId);
    const wasBroken = prev?.status === 'broken';
    const now = new Date().toISOString();

    // Alert when we have never alerted, when the KIND of fault changed, or
    // when the throttle window has elapsed.
    //
    // `last_alerted_at` and `fault_kind` deliberately survive a recovery (see
    // reportCredentialOk). Some faults flap rather than staying down — Meta's
    // billing block (131042) lets some sends through and rejects others, and
    // Devprayagjal is doing exactly that today. Keying the alert off "was it
    // broken a moment ago" would email on every single flap; keying it off the
    // last time we actually spoke up does not.
    const lastAlertedMs = prev?.last_alerted_at ? new Date(prev.last_alerted_at).getTime() : 0;
    const kindChanged = prev?.fault_kind != null && prev.fault_kind !== fault.kind;
    const shouldAlert =
      !prev?.last_alerted_at || kindChanged || Date.now() - lastAlertedMs >= ALERT_THROTTLE_MS;

    await supabaseAdmin.from('wa_credential_health').upsert(
      {
        tenant_id: tenantId,
        status: 'broken',
        fault_kind: fault.kind,
        fault_code: fault.code ?? null,
        fault_subcode: fault.subcode ?? null,
        fault_title: fault.title,
        fault_action: fault.action,
        detail: detail?.slice(0, 500) ?? null,
        phone_number_id: phoneNumberId ?? null,
        consecutive_failures: (prev?.consecutive_failures ?? 0) + 1,
        // Keep the ORIGINAL start of the outage across repeats — that elapsed
        // time is the number that makes the alert impossible to ignore.
        first_failed_at: wasBroken ? (prev?.first_failed_at ?? now) : now,
        last_checked_at: now,
        ...(shouldAlert ? { last_alerted_at: now } : {}),
        updated_at: now,
      },
      { onConflict: 'tenant_id' },
    );

    if (!shouldAlert) return;

    const downFor = hoursSince(wasBroken ? (prev?.first_failed_at ?? now) : now);
    const downLabel = downFor != null && downFor >= 1 ? ` — down ${downFor}h` : '';

    await notifyAdmin({
      // Per-tenant AND per-fault-kind: a token expiry that follows a billing
      // block is a different problem and must not be swallowed by the throttle.
      dedupeKey: `wa-credentials-broken:${tenantId}:${fault.kind}`,
      subject: `🚨 WhatsApp OFFLINE for ${businessName || tenantId}${downLabel}`,
      summary:
        `${fault.title}. This tenant cannot send ANY WhatsApp message — ` +
        `inbound still works, so the inbox will look normal while every reply fails. ` +
        `Fix: ${fault.action}`,
      context: {
        tenantId,
        businessName,
        phoneNumberId,
        faultKind: fault.kind,
        metaCode: fault.code,
        metaSubcode: fault.subcode,
        consecutiveFailures: (prev?.consecutive_failures ?? 0) + 1,
        outageStarted: wasBroken ? prev?.first_failed_at : now,
        detail: detail?.slice(0, 300),
      },
    });
  } catch (err) {
    // Never propagate — see the contract at the top of this file.
    console.error('[wa-health] reportCredentialFault failed:', (err as Error).message);
  }
}

/**
 * Records a confirmed-good credential, and announces recovery if it had been
 * broken.
 *
 * Deliberately does NOT clear `fault_kind` or `last_alerted_at`: those two are
 * what let reportCredentialFault tell "a new problem" from "the same flapping
 * problem" and keep a self-healing fault from emailing on every cycle. The
 * live state is `status`, and that IS cleared.
 */
export async function reportCredentialOk(params: {
  tenantId: string;
  businessName?: string | null;
  phoneNumberId?: string | null;
}): Promise<void> {
  const { tenantId, businessName, phoneNumberId } = params;
  try {
    const prev = await readHealth(tenantId);
    const now = new Date().toISOString();

    await supabaseAdmin.from('wa_credential_health').upsert(
      {
        tenant_id: tenantId,
        status: 'ok',
        fault_code: null,
        fault_subcode: null,
        fault_title: null,
        fault_action: null,
        detail: null,
        phone_number_id: phoneNumberId ?? null,
        consecutive_failures: 0,
        first_failed_at: null,
        last_ok_at: now,
        last_checked_at: now,
        updated_at: now,
      },
      { onConflict: 'tenant_id' },
    );

    if (prev?.status === 'broken') {
      const downFor = hoursSince(prev.first_failed_at);
      await notifyAdmin({
        dedupeKey: `wa-credentials-recovered:${tenantId}`,
        subject: `✅ WhatsApp restored for ${businessName || tenantId}`,
        summary: `Sending works again${downFor != null ? ` after ${downFor}h offline` : ''}.`,
        context: { tenantId, businessName, phoneNumberId },
      });
    }
  } catch (err) {
    console.error('[wa-health] reportCredentialOk failed:', (err as Error).message);
  }
}

/**
 * The one line a send path calls when a WhatsApp send fails.
 *
 * Classifies the error; if it is credential-class, records the outage and
 * escalates. Returns the fault so the caller can also persist an
 * operator-readable reason on the message row. Returns null for ordinary
 * per-message failures (closed 24h window, bad template, rejected media) —
 * those are NOT outages and must not raise the banner.
 *
 * Safe to call on every failure: it only touches the DB when the error is
 * genuinely credential-class.
 */
export async function noteSendFailure(params: {
  tenantId: string;
  businessName?: string | null;
  phoneNumberId?: string | null;
  error: unknown;
}): Promise<CredentialFault | null> {
  const fault = classifyCredentialFault(params.error);
  if (!fault) return null;

  await reportCredentialFault({
    tenantId: params.tenantId,
    businessName: params.businessName,
    phoneNumberId: params.phoneNumberId,
    fault,
    detail: typeof params.error === 'string' ? params.error : (params.error as Error)?.message,
  });
  return fault;
}

/**
 * Marks a tenant healthy again after a send SUCCEEDS, but only when we already
 * believed it was broken. Reads one small row per send, and only when we have
 * a reason to; a send that succeeds on a tenant already marked 'ok' does no
 * work at all beyond that read.
 */
export async function noteSendSuccess(params: {
  tenantId: string;
  businessName?: string | null;
  phoneNumberId?: string | null;
}): Promise<void> {
  try {
    const prev = await readHealth(params.tenantId);
    if (prev?.status === 'broken') await reportCredentialOk(params);
  } catch (err) {
    console.error('[wa-health] noteSendSuccess failed:', (err as Error).message);
  }
}
