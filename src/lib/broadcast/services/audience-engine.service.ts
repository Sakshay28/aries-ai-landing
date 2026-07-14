import { supabaseAdmin } from '@/lib/supabase/admin';
import { AudienceState, EstimateResult } from '@/app/dashboard/broadcast/types';
import { cleanPhone } from '@/lib/meta/service';
import { fetchLeadsByFilter, fetchLeadsByIds } from '@/lib/broadcast/fetch-leads';
import { cleanContactName } from '@/lib/broadcast/recipient-name';

interface ResolvedAudience {
  total: number;
  duplicatesRemoved: number;
  optedOutRemoved: number;
  invalidRemoved: number;
  noConsentRemoved: number;
  spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  contacts: Array<{ id: string; name: string | null; phone: string }>;
}

export class AudienceEngineService {
  /**
   * Resolves audience list and executes conditional multi-tenant segment filtering,
   * opt-out checks, E.164 validations, and strict deduplication.
   */
  static async resolveAudience(tenantId: string, audience: AudienceState): Promise<ResolvedAudience> {
    try {
      let rawContacts: any[] = [];

      // 1. Fetch contacts based on targeting type
      if (audience.type === 'all') {
        rawContacts = await fetchLeadsByFilter(tenantId, 'id, name, phone, tags, email, notes, channel, last_message_at');

      } else if (audience.type === 'tags' && audience.tags.length > 0) {
        // Fetch contacts matching any of the selected tags (using overlap operator)
        rawContacts = await fetchLeadsByFilter(tenantId, 'id, name, phone, tags, email, notes, channel, last_message_at', { tags: audience.tags });

      } else if (audience.type === 'custom' && audience.customFilters.length > 0) {
        // Fetch all contacts first and filter them in memory to support complex nested AND/OR segment validations
        const allLeads = await fetchLeadsByFilter(tenantId, 'id, name, phone, tags, email, notes, channel, last_message_at, lead_score');

        // Apply filters (AND connection)
        rawContacts = allLeads.filter(lead => {
          return audience.customFilters.every(filter => {
            if (!filter.field || !filter.value) return true;
            
            const leadObj = lead as Record<string, any>;
            const leadVal = String(leadObj[filter.field] || leadObj[filter.field.toLowerCase()] || '').toLowerCase();
            const filterVal = filter.value.toLowerCase();

            if (filter.operator === '=') {
              return leadVal === filterVal;
            }
            if (filter.operator === 'contains') {
              return leadVal.includes(filterVal);
            }
            if (filter.operator === '>') {
              return Number(leadVal) > Number(filterVal);
            }
            if (filter.operator === '<') {
              return Number(leadVal) < Number(filterVal);
            }
            return true;
          });
        });

      } else if (audience.type === 'retarget' && audience.retargetCampaignId) {
        // Fetch delivery records of the parent campaign
        const { data: parentMsgs, error: parentMsgsErr } = await supabaseAdmin
          .from('broadcast_deliveries')
          .select('contact_id, status')
          .eq('campaign_id', audience.retargetCampaignId);

        if (parentMsgsErr) throw parentMsgsErr;

        const targetContactIds: string[] = [];
        
        if (audience.retargetCondition === 'unread') {
          // Contact didn't read (i.e. status was sent/delivered but not read)
          const readIds = new Set((parentMsgs || []).filter(m => m.status === 'read').map(m => m.contact_id));
          (parentMsgs || []).forEach(m => {
            if (m.contact_id && !readIds.has(m.contact_id)) targetContactIds.push(m.contact_id);
          });
        } else if (audience.retargetCondition === 'no_reply') {
          // Only target contacts who were sent the campaign but did NOT send any inbound reply.
          // Fetch inbound messages linked to this campaign to find who replied.
          const { data: inboundReplies } = await supabaseAdmin
            .from('messages')
            .select('contact_id')
            .eq('campaign_id', audience.retargetCampaignId)
            .eq('direction', 'inbound');
          const repliedContactIds = new Set((inboundReplies || []).map((r: any) => r.contact_id).filter(Boolean));
          const sentIds = (parentMsgs || []).map(m => m.contact_id).filter(Boolean) as string[];
          // Exclude contacts who replied — target only those who didn't respond
          sentIds.filter(id => !repliedContactIds.has(id)).forEach(id => targetContactIds.push(id));
        }

        if (targetContactIds.length > 0) {
          rawContacts = await fetchLeadsByIds(tenantId, 'id, name, phone, tags, email, notes, channel, last_message_at', targetContactIds);
        }

      } else if (audience.type === 'manual' && audience.manualContactIds && audience.manualContactIds.length > 0) {
        // Particular contacts manually selected
        rawContacts = await fetchLeadsByIds(tenantId, 'id, name, phone, tags, email, notes, channel, last_message_at', audience.manualContactIds);

      } else if (audience.type === 'csv' && audience.csvFile && Array.isArray(audience.csvFile.contacts)) {
        // Custom spreadsheet imported contacts
        rawContacts = audience.csvFile.contacts.map((c: any, idx: number) => ({
          id: c.id || `csv-${idx}`,
          name: cleanContactName(c.name || c.contact_name),
          phone: c.phone || c.phone_number,
          tags: c.tags || [],
          email: c.email || ''
        }));

      } else if (audience.type === 'csv' && (audience as any).filters?.csvFile?.contacts) {
        // Compatibility check for nested DB fields
        const csvContacts = (audience as any).filters.csvFile.contacts;
        rawContacts = csvContacts.map((c: any, idx: number) => ({
          id: c.id || `csv-${idx}`,
          name: cleanContactName(c.name || c.contact_name),
          phone: c.phone || c.phone_number,
          tags: c.tags || [],
          email: c.email || ''
        }));

      } else {
        rawContacts = [];
      }

      // 1b. Additive manual selections + manual exclusions.
      // The builder's live estimate (BroadcastRecipientService) treats manualContactIds
      // as contacts ADDED on top of the base targeting type, and excludedContactIds as
      // contacts removed from it. This resolver populates the real send queue, so it MUST
      // apply the same rules — otherwise the count the user approves (e.g. 1) diverges from
      // what actually gets sent (e.g. all 7).
      const manualIds = audience.manualContactIds || [];
      if (manualIds.length > 0) {
        const existingIds = new Set(rawContacts.map(c => c.id));
        const missingManualIds = manualIds.filter(id => !existingIds.has(id));
        if (missingManualIds.length > 0) {
          const manualLeads = await fetchLeadsByIds(tenantId, 'id, name, phone, tags, email, notes, channel, last_message_at', missingManualIds);
          rawContacts = [...rawContacts, ...manualLeads];
        }
      }

      const excludedIds = new Set(audience.excludedContactIds || []);

      // 2. Strict Deduplication, Opt-out Filtering, and Phone Verification
      // Pre-fetch all active optouts for this tenant in one query (O(1) per lead)
      const { data: optoutRows } = await supabaseAdmin
        .from('broadcast_optouts')
        .select('phone')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      const optoutPhones = new Set((optoutRows || []).map((r: { phone: string }) => r.phone));

      const seenPhones = new Set<string>();
      const seenContactIds = new Set<string>();

      const filteredContacts: Array<{ id: string; name: string | null; phone: string }> = [];
      let duplicatesRemoved = 0;
      let optedOutRemoved = 0;
      let invalidRemoved = 0;
      let noConsentRemoved = 0;

      for (const lead of rawContacts) {
        // Manual exclusion — contact deselected in the Recipients drawer
        if (excludedIds.has(lead.id)) {
          continue;
        }

        if (!lead.phone) {
          invalidRemoved++;
          continue;
        }

        let phoneCleaned: string;
        try {
          phoneCleaned = cleanPhone(lead.phone);
        } catch {
          invalidRemoved++;
          continue;
        }
        if (!phoneCleaned || phoneCleaned.length < 10) {
          invalidRemoved++;
          continue;
        }

        // Check dedicated optouts table first (fast Set lookup)
        // Fall back to tags array for backwards compatibility with old opt-out mechanism
        const tagsList = lead.tags || [];
        const isOptedOutByTag = tagsList.some((t: string) =>
          t.toLowerCase() === 'opt-out' ||
          t.toLowerCase() === 'optout' ||
          t.toLowerCase() === 'unsubscribe' ||
          t.toLowerCase() === 'stop'
        );
        const isOptedOut = optoutPhones.has(phoneCleaned) || isOptedOutByTag;

        if (isOptedOut) {
          optedOutRemoved++;
          continue;
        }

        // Consent check: contact must have prior inbound interaction
        const leadChannel = (lead.channel || '').toLowerCase();
        const hasConsent = leadChannel === 'whatsapp' || !!lead.last_message_at;
        if (!hasConsent) {
          noConsentRemoved++;
          continue;
        }

        // Deduplication rules
        if (seenPhones.has(phoneCleaned) || seenContactIds.has(lead.id)) {
          duplicatesRemoved++;
          continue;
        }

        seenPhones.add(phoneCleaned);
        seenContactIds.add(lead.id);

        filteredContacts.push({
          id: lead.id,
          // Clean human name or null; the send path applies the neutral "there"
          // greeting fallback at render time (broadcast-engine / variable-engine).
          name: cleanContactName(lead.name),
          phone: phoneCleaned,
        });
      }

      const total = filteredContacts.length;
      const spamRisk = total > 5000 ? 'HIGH' : total > 2000 ? 'MEDIUM' : 'LOW';

      return {
        total,
        duplicatesRemoved,
        optedOutRemoved,
        invalidRemoved,
        noConsentRemoved,
        spamRisk,
        contacts: filteredContacts,
      };

    } catch (e) {
      console.error('❌ AudienceEngine resolution failed:', e);
      return {
        total: 0,
        duplicatesRemoved: 0,
        optedOutRemoved: 0,
        invalidRemoved: 0,
        noConsentRemoved: 0,
        spamRisk: 'LOW',
        contacts: [],
      };
    }
  }
}
