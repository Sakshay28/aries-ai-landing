// ═══════════════════════════════════════════════════════════
// ⏸️ Account Pause — unpaid subscription hold
// ═══════════════════════════════════════════════════════════
// plan_status='suspended' is the single switch. While it's set:
//   • no WhatsApp message leaves the tenant's number (gate below, enforced
//     inside lib/meta/service so no caller can forget it)
//   • inbound customer messages are still stored, nothing is lost
//   • the dashboard and tenant APIs are locked (/paused)
// Flip back to 'active' from the admin panel to restore everything.
// Do NOT use is_active=false for this: the tenant stops resolving in the webhook
// and customer messages are dropped.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

export const PAUSED_PLAN_STATUS = 'suspended';

export function isPlanPaused(planStatus: string | null | undefined): boolean {
  return planStatus === PAUSED_PLAN_STATUS;
}

export class WhatsAppPausedError extends Error {
  constructor(phoneNumberId: string) {
    super(`WhatsApp sending is paused for number ${phoneNumberId} (subscription on hold)`);
    this.name = 'WhatsAppPausedError';
  }
}

// Sends are hot-path, so one lookup per number per minute per instance.
const CACHE_TTL_MS = 60_000;
const pausedCache = new Map<string, { paused: boolean; expiresAt: number }>();

export function clearPauseCache(): void {
  pausedCache.clear();
}

export async function isWhatsAppNumberPaused(phoneNumberId: string): Promise<boolean> {
  const cached = pausedCache.get(phoneNumberId);
  if (cached && cached.expiresAt > Date.now()) return cached.paused;

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('plan_status')
      .eq('wa_phone_number_id', phoneNumberId)
      .eq('plan_status', PAUSED_PLAN_STATUS)
      .limit(1);
    if (error) throw new Error(error.message);

    const paused = Array.isArray(data) && data.some((row) => isPlanPaused(row?.plan_status));
    pausedCache.set(phoneNumberId, { paused, expiresAt: Date.now() + CACHE_TTL_MS });
    return paused;
  } catch (err) {
    // A failed lookup must not take every other tenant's sending down with it.
    console.error('[pause] lookup failed, using last known state:', (err as Error).message);
    return cached?.paused ?? false;
  }
}

export async function assertWhatsAppNotPaused(phoneNumberId: string): Promise<void> {
  if (await isWhatsAppNumberPaused(phoneNumberId)) {
    throw new WhatsAppPausedError(phoneNumberId);
  }
}
