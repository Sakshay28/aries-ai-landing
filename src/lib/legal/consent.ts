// ═══════════════════════════════════════════════════════════
// 📜 Consent Recording
// ═══════════════════════════════════════════════════════════
// Unlike logAudit() (fire-and-forget, non-critical), recordConsent()
// throws on failure. A signup that "succeeds" without a provable consent
// record is a compliance gap, not a minor logging miss — callers must
// catch the throw and fail the signup / roll back the tenant they just
// created.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

// Bump this whenever the Terms/Privacy Policy content materially changes —
// keep in sync with the "Last updated" date on /terms and /privacy.
export const CURRENT_POLICY_VERSION = '2026-05-07';

export type ConsentSource = 'otp_signup' | 'google_oauth' | 'password_signup';

export interface ConsentParams {
  tenantId: string;
  email: string;
  ip: string;
  userAgent?: string | null;
  source: ConsentSource;
}

export async function recordConsent(params: ConsentParams): Promise<void> {
  const { error } = await supabaseAdmin.from('consent_records').insert({
    tenant_id: params.tenantId,
    email: params.email,
    consent_type: 'terms_and_privacy',
    policy_version: CURRENT_POLICY_VERSION,
    source: params.source,
    ip_address: params.ip,
    user_agent: params.userAgent ?? null,
  });

  if (error) {
    throw new Error(`Failed to record consent: ${error.message}`);
  }
}
