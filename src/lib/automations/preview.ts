// Shared preview helpers: build sample variables from the tenant's REAL data
// and render a template the same way the engine does. Used by the variables
// (live preview) and test/dry-run routes so the editor preview matches runtime.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { SAMPLE_VARIABLES, KNOWN_VARIABLE_NAMES } from '@/lib/automations/variables';

export async function tenantSampleData(tenantId: string): Promise<Record<string, string>> {
  const merged: Record<string, string> = { ...SAMPLE_VARIABLES };
  try {
    const [{ data: tenant }, { data: lead }] = await Promise.all([
      supabaseAdmin.from('tenants')
        .select('business_name, business_phone, business_address, google_review_url')
        .eq('id', tenantId).maybeSingle(),
      supabaseAdmin.from('leads')
        .select('name, phone')
        .eq('tenant_id', tenantId)
        .not('name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle(),
    ]);
    if (tenant?.business_name) { merged.business_name = tenant.business_name; merged.restaurant_name = tenant.business_name; }
    if (tenant?.business_phone) merged.business_phone = tenant.business_phone;
    if (tenant?.business_address) merged.business_address = tenant.business_address;
    if ((tenant as any)?.google_review_url) merged.google_review_url = (tenant as any).google_review_url;
    if (lead?.name) { merged.customer_name = lead.name; merged.first_name = lead.name.split(' ')[0]; }
    if (lead?.phone) merged.customer_phone = lead.phone;
  } catch { /* fall back to generic sample */ }
  return merged;
}

/**
 * Render exactly like the engine: substitute {{key}}, track unresolved keys and
 * unknown (non-registry) keys. Identical semantics keep preview === runtime.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string>,
): { rendered: string; unresolved: string[]; unknownKeys: string[] } {
  const unresolved: string[] = [];
  const unknownKeys: string[] = [];
  const rendered = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!KNOWN_VARIABLE_NAMES.has(key)) unknownKeys.push(key);
    const val = vars[key];
    if (val === undefined || val === null) {
      unresolved.push(key);
      return match;
    }
    return val;
  });
  return { rendered, unresolved, unknownKeys };
}
