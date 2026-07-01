// ═══════════════════════════════════════════════════════════
// 📄 Template Manager — event_type → approved WhatsApp template
// ═══════════════════════════════════════════════════════════
// Resolves the template a tenant has bound to a system event (booking
// confirmation, human assistance, payment confirmation, ...) so a blocked
// send can automatically fall back to it instead of failing outright.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

export type SystemEventType =
  | 'booking_confirmation'
  | 'booking_reminder'
  | 'human_assistance'
  | 'support_response'
  | 'lead_follow_up'
  | 'callback_request'
  | 'order_update'
  | 'reservation_update'
  | 'thank_you'
  | 'payment_confirmation'
  | 'staff_keepalive';

export interface ResolvedTemplate {
  name: string;
  language: string;
  // variables_json: { variableName: positionalIndex } e.g. { customer_name: 1, reservation_id: 2 }
  variableMap: Record<string, number>;
}

/**
 * Looks up the tenant's APPROVED draft_templates row bound to this event
 * (see migration 20260701_guaranteed_business_delivery.sql — one bound
 * approved template per event per tenant, enforced by a partial unique
 * index). Returns null if the tenant hasn't bound one yet.
 */
export async function resolveEventTemplate(
  tenantId: string,
  eventType: SystemEventType,
): Promise<ResolvedTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from('draft_templates')
    .select('normalized_name, language, variables_json')
    .eq('tenant_id', tenantId)
    .eq('event_type', eventType)
    .eq('status', 'APPROVED')
    .maybeSingle();

  if (error || !data) return null;

  return {
    name: data.normalized_name,
    language: data.language || 'en',
    variableMap: (data.variables_json as Record<string, number>) ?? {},
  };
}

/**
 * Converts named variables into Meta's positional body-parameter order using
 * the template's variableMap ({ customer_name: 1, reservation_id: 2 }).
 * Missing values render as an empty string rather than blocking the send —
 * a template with a blank slot is far better than a lost business alert.
 */
export function mapVariablesToPositional(
  variableMap: Record<string, number>,
  vars: Record<string, string>,
): string[] {
  const maxIndex = Math.max(0, ...Object.values(variableMap));
  const positional: string[] = new Array(maxIndex).fill('');

  for (const [name, index] of Object.entries(variableMap)) {
    if (index >= 1 && index <= maxIndex) {
      positional[index - 1] = vars[name] ?? '';
    }
  }

  return positional;
}
