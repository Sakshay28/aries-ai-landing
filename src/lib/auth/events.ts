// Structured auth event logger — writes to analytics_events with full context.
// All auth actions (OTP sent/verified/failed/expired, login, logout, signup)
// land here so failures are diagnosable without log scraping.

import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuthEventType =
  | 'otp_requested'
  | 'otp_sent'
  | 'otp_send_failed'
  | 'otp_send_rate_limited'
  | 'otp_verify_success'
  | 'otp_verify_failed'
  | 'otp_verify_rate_limited'
  | 'otp_verify_no_session'
  | 'otp_verify_error'
  | 'otp_resend'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'signup_started'
  | 'signup_provisioned'
  | 'signup_provision_failed'
  | 'google_oauth_started'
  | 'google_oauth_success'
  | 'google_oauth_failed'
  | 'session_refreshed'
  | 'session_expired';

export async function logAuthEvent(
  event: AuthEventType,
  email: string,
  ip: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabaseAdmin.from('analytics_events').insert({
      // tenant_id is null for pre-auth events (no tenant yet)
      tenant_id: (meta.tenantId as string) ?? null,
      event_type: `auth:${event}`,
      metadata: {
        email: email || undefined,
        ip,
        ts: new Date().toISOString(),
        ...meta,
      },
    });
  } catch {
    // Non-fatal — logging must never break auth
  }
}
