// ═══════════════════════════════════════════════════════════
// Lead fetching — pagination-safe helpers
// ═══════════════════════════════════════════════════════════
// PostgREST caps a single response at `db-max-rows` (1000 by default on
// Supabase). A plain `.select()` therefore SILENTLY truncates any audience
// larger than the cap — a 5,000-contact "All Contacts" broadcast would only
// reach the first 1,000 recipients, and the approved count would not match
// what actually sends. These helpers page through the full result set with
// keyset pagination (immune to the row cap as long as pageSize ≤ cap) so the
// audience resolver and the estimator both see every matching contact.
//
// Shared by AudienceEngineService (send) and BroadcastRecipientService
// (estimate) so the two cannot diverge.
import { supabaseAdmin } from '@/lib/supabase/admin';

const PAGE_SIZE = 1000;   // ≤ default db-max-rows; safe for any project setting
const ID_CHUNK = 500;     // keeps `.in()` URL length and row count bounded

/**
 * Fetch ALL leads for a tenant matching an optional tag overlap, paging past
 * the PostgREST row cap. Returns every matching row, not just the first page.
 */
export async function fetchLeadsByFilter(
  tenantId: string,
  columns: string,
  opts: { tags?: string[] } = {}
): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = null;

  for (;;) {
    let q = supabaseAdmin
      .from('leads')
      .select(columns)
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (opts.tags && opts.tags.length > 0) q = q.overlaps('tags', opts.tags);
    if (cursor) q = q.gt('id', cursor);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    out.push(...data);
    if (data.length < PAGE_SIZE) break;          // last (partial) page
    cursor = (data[data.length - 1] as any)?.id ?? null;
    if (!cursor) break;
  }

  return out;
}

/**
 * Fetch leads by an explicit id list, chunked so a large list (e.g. a big
 * retarget cohort) never exceeds the `.in()` URL length or the row cap.
 */
export async function fetchLeadsByIds(
  tenantId: string,
  columns: string,
  ids: string[]
): Promise<any[]> {
  const out: any[] = [];

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(columns)
      .eq('tenant_id', tenantId)
      .in('id', slice)
      .not('phone', 'is', null);
    if (error) throw error;
    if (data) out.push(...data);
  }

  return out;
}
