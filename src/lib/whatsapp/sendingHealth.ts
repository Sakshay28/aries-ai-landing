// Can this WhatsApp number actually SEND? — Meta's health_status, not token access.
//
// credentialHealth.ts proves the token can see the phone number. That check
// stayed green for the four weeks Devprayagjal's WABA was blocked over a
// payment-method error (141006): every order confirmation failed with 131042
// "Business eligibility payment issue" and nobody found out until the client
// complained (2026-09-03 → 2026-10-01). health_status reports exactly that.

const META_BASE = 'https://graph.facebook.com/v22.0';

// WhatsApp *calling* (SIP) isn't used by Aries; Meta lists it as an error on
// every number that hasn't configured it. Not a sending problem.
const IGNORED_ERROR_CODES = new Set([138024, 138025]);

interface HealthEntity {
  entity_type?: string;
  id?: string;
  can_send_message?: string;
  errors?: Array<{ error_code?: number; error_description?: string; possible_solution?: string }>;
}

export interface SendingHealth {
  /** 'AVAILABLE' | 'LIMITED' | 'BLOCKED' (overall), or null if Meta didn't say. */
  canSend: string | null;
  /** Human-readable problems worth alerting on; empty = healthy. */
  issues: string[];
}

/** Pure: turns Meta's health_status object into the problems that matter. */
export function parseSendingHealth(healthStatus: { can_send_message?: string; entities?: HealthEntity[] } | null | undefined): SendingHealth {
  const issues: string[] = [];
  for (const e of healthStatus?.entities || []) {
    const errors = (e.errors || []).filter((x) => !IGNORED_ERROR_CODES.has(Number(x.error_code)));
    for (const x of errors) {
      issues.push(`${e.entity_type}: ${x.error_description || 'error ' + x.error_code}${x.possible_solution ? ` — ${x.possible_solution}` : ''}`);
    }
    if (e.can_send_message === 'BLOCKED' && errors.length === 0) {
      issues.push(`${e.entity_type}: sending is BLOCKED by Meta`);
    }
  }
  return { canSend: healthStatus?.can_send_message ?? null, issues };
}

export async function checkSendingHealth(accessToken: string, phoneNumberId: string, fetchImpl: typeof fetch = fetch): Promise<SendingHealth | null> {
  try {
    const res = await fetchImpl(`${META_BASE}/${phoneNumberId}?fields=health_status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null; // token/access problems are credentialHealth's job
    const body = (await res.json()) as { health_status?: { can_send_message?: string; entities?: HealthEntity[] } };
    return parseSendingHealth(body.health_status);
  } catch {
    return null; // network blip — inconclusive, never alert on it
  }
}
