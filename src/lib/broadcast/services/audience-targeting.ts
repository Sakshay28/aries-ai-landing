import { supabaseAdmin } from '@/lib/supabase/admin';
import { AudienceState } from '@/app/dashboard/broadcast/types';
import { fetchLeadsByFilter, fetchLeadsByIds, fetchRecentLeads } from '@/lib/broadcast/fetch-leads';
import { cleanContactName } from '@/lib/broadcast/recipient-name';

// One column set for every branch — the compliance/output stages only read
// id/name/phone/tags/email/channel/last_message_at; custom filters also read
// lead_score. (The old resolvers fetched a stray, unused `notes` column in one
// copy and not the other — unified away here.)
const COLS = 'id, name, phone, tags, email, channel, last_message_at';
const COLS_WITH_SCORE = 'id, name, phone, tags, email, channel, last_message_at, lead_score';

export interface TargetedContact {
  id: string;
  name: string | null;
  phone: string;
  tags?: string[];
  email?: string | null;
  channel?: string | null;
  last_message_at?: string | null;
  lead_score?: number | null;
  // true when the row was ADDED via manualContactIds on top of the base
  // targeting type (used by the preview resolver for a "Manual Override" label).
  isManualAddition: boolean;
}

export interface TargetingResult {
  contacts: TargetedContact[];
  sourceLabel: string;
}

/**
 * SINGLE targeting resolver: audience definition → raw contact rows, including
 * additive manual selections. This is the one place that maps an `audience.type`
 * to a base cohort and layers `manualContactIds` on top, so the send resolver
 * (AudienceEngineService), the preview resolver (BroadcastRecipientService), and
 * the estimate/readiness paths can never disagree on WHICH contacts an audience
 * targets.
 *
 * Compliance filtering (opt-out, phone validation, dedup, and `excludedContactIds`
 * handling) intentionally stays in each caller: they emit different shapes (a
 * lightweight {id,name,phone} list for the send vs. rich per-recipient status
 * records for the preview UI). But both now filter an identical input set.
 */
export async function resolveTargetContacts(
  tenantId: string,
  audience: AudienceState,
): Promise<TargetingResult> {
  let rawContacts: Array<Record<string, unknown>> = [];
  let sourceLabel = 'All Contacts';

  if (audience.type === 'all') {
    rawContacts = await fetchLeadsByFilter(tenantId, COLS);
    sourceLabel = 'All Contacts';

  } else if (audience.type === 'tags' && audience.tags.length > 0) {
    rawContacts = await fetchLeadsByFilter(tenantId, COLS, { tags: audience.tags });
    sourceLabel = `Tag → ${audience.tags.join(', ')}`;

  } else if (audience.type === 'custom' && audience.customFilters.length > 0) {
    // Only 'lead_score' and 'channel' are backed by selectable columns (see
    // COLS_WITH_SCORE). Any other field resolves to '' and therefore matches
    // nobody — a deliberately fail-CLOSED default: for a broadcast, an
    // unrecognized filter must never fall through to "send to everyone".
    const allLeads = await fetchLeadsByFilter(tenantId, COLS_WITH_SCORE);
    rawContacts = allLeads.filter((lead) =>
      audience.customFilters.every((filter) => {
        if (!filter.field || !filter.value) return true;
        const leadObj = lead as Record<string, unknown>;
        const leadVal = String(leadObj[filter.field] ?? leadObj[filter.field.toLowerCase()] ?? '').toLowerCase();
        const filterVal = filter.value.toLowerCase();
        if (filter.operator === '=') return leadVal === filterVal;
        if (filter.operator === 'contains') return leadVal.includes(filterVal);
        if (filter.operator === '>') return Number(leadVal) > Number(filterVal);
        if (filter.operator === '<') return Number(leadVal) < Number(filterVal);
        return true;
      }),
    );
    sourceLabel = 'Segment Filter';

  } else if (audience.type === 'retarget' && audience.retargetCampaignId) {
    const { data: parentMsgs, error: parentMsgsErr } = await supabaseAdmin
      .from('broadcast_deliveries')
      .select('contact_id, status')
      .eq('campaign_id', audience.retargetCampaignId);
    if (parentMsgsErr) throw parentMsgsErr;

    const targetContactIds: string[] = [];
    if (audience.retargetCondition === 'unread') {
      const readIds = new Set((parentMsgs || []).filter((m) => m.status === 'read').map((m) => m.contact_id));
      (parentMsgs || []).forEach((m) => {
        if (m.contact_id && !readIds.has(m.contact_id)) targetContactIds.push(m.contact_id);
      });
    } else if (audience.retargetCondition === 'no_reply') {
      const { data: inboundReplies } = await supabaseAdmin
        .from('messages')
        .select('contact_id')
        .eq('campaign_id', audience.retargetCampaignId)
        .eq('direction', 'inbound');
      const repliedContactIds = new Set((inboundReplies || []).map((r) => (r as { contact_id?: string }).contact_id).filter(Boolean));
      const sentIds = (parentMsgs || []).map((m) => m.contact_id).filter(Boolean) as string[];
      sentIds.filter((id) => !repliedContactIds.has(id)).forEach((id) => targetContactIds.push(id));
    }

    if (targetContactIds.length > 0) {
      rawContacts = await fetchLeadsByIds(tenantId, COLS, targetContactIds);
    }
    sourceLabel = `Retargeting → ${audience.retargetCondition}`;

  } else if (audience.type === 'manual' && audience.manualContactIds && audience.manualContactIds.length > 0) {
    rawContacts = await fetchLeadsByIds(tenantId, COLS, audience.manualContactIds);
    sourceLabel = 'Manual Selection';

  } else if (audience.type === 'csv' && audience.csvFile && Array.isArray(audience.csvFile.contacts)) {
    rawContacts = audience.csvFile.contacts.map((c, idx: number) => ({
      id: c.id || `csv-${idx}`,
      name: cleanContactName(c.name || (c as { contact_name?: string }).contact_name),
      phone: c.phone || (c as { phone_number?: string }).phone_number,
      tags: (c as { tags?: string[] }).tags || [],
      email: c.email || '',
      last_message_at: null,
    }));
    sourceLabel = 'CSV Upload';

  } else if (audience.type === 'recent') {
    const limit = audience.recentCount || 50;
    rawContacts = await fetchRecentLeads(tenantId, COLS, limit);
    sourceLabel = `Recently Added (Last ${limit})`;
  }

  // Additive manual selections — contacts ADDED on top of the base targeting
  // (deduped against the base; only the ones not already present are fetched).
  const contacts: TargetedContact[] = rawContacts.map((c) => ({ ...(c as unknown as TargetedContact), isManualAddition: false }));
  const manualIds = audience.manualContactIds || [];
  if (manualIds.length > 0) {
    const existing = new Set(contacts.map((c) => c.id));
    const missing = manualIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      const manualLeads = await fetchLeadsByIds(tenantId, COLS, missing);
      manualLeads.forEach((c) => contacts.push({ ...(c as unknown as TargetedContact), isManualAddition: true }));
    }
  }

  return { contacts, sourceLabel };
}
