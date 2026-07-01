// ═══════════════════════════════════════════════════════════
// 📶 WhatsApp Session State — single source of truth
// ═══════════════════════════════════════════════════════════
// Reads the per-(tenant, phone) session state that migration
// 20260701_guaranteed_business_delivery.sql maintains on `conversations` via
// a trigger on every `messages` insert. Never guesses: if there's no
// conversation row for this phone, it has never had an open window (correct
// answer for e.g. a staff/manager phone that has never messaged the bot).
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

export interface SessionState {
  conversationId: string | null;
  windowOpen: boolean;
  windowExpiresAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastTemplateName: string | null;
  lastTemplateSentAt: string | null;
}

const CLOSED_STATE: SessionState = {
  conversationId: null,
  windowOpen: false,
  windowExpiresAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  lastTemplateName: null,
  lastTemplateSentAt: null,
};

// Pure — never guesses: null/missing expiry means the window has never been
// open (correct for a phone that's never messaged in). Exported so the
// open/closed boundary is unit-testable without touching the DB.
export function isWindowOpen(windowExpiresAt: string | null, now: number = Date.now()): boolean {
  return !!windowExpiresAt && new Date(windowExpiresAt).getTime() > now;
}

// Pure — decides whether the staff-keepalive cron should ping this phone:
// true when the window has never been open (needs a template, not a ping)
// OR has <= lookaheadMs left before it closes. Exported for the same reason
// as isWindowOpen.
export function shouldPingForKeepalive(
  windowExpiresAt: string | null,
  lookaheadMs: number,
  now: number = Date.now(),
): boolean {
  if (!windowExpiresAt) return true;
  return new Date(windowExpiresAt).getTime() <= now + lookaheadMs;
}

/**
 * Looks up the WhatsApp session state for a (tenant, phone) pair. `phone`
 * matches `conversations.sender_id` — the same lookup key used for both
 * customer and staff/manager phones (both get an ordinary conversation row
 * the first time they message the bot).
 */
export async function getSessionState(tenantId: string, phone: string): Promise<SessionState> {
  if (!tenantId || !phone) return CLOSED_STATE;

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, window_expires_at, last_inbound_at, last_outbound_at, last_template_name, last_template_sent_at')
    .eq('tenant_id', tenantId)
    .eq('sender_id', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return CLOSED_STATE;

  const windowExpiresAt = data.window_expires_at as string | null;

  return {
    conversationId: data.id,
    windowOpen: isWindowOpen(windowExpiresAt),
    windowExpiresAt,
    lastInboundAt: data.last_inbound_at,
    lastOutboundAt: data.last_outbound_at,
    lastTemplateName: data.last_template_name,
    lastTemplateSentAt: data.last_template_sent_at,
  };
}
