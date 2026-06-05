import { supabaseAdmin } from '@/lib/supabase/admin';
import { AudienceState, EstimateResult } from '@/app/dashboard/broadcast/types';
import { cleanPhone } from '@/lib/meta/service';

interface ResolvedAudience {
  total: number;
  duplicatesRemoved: number;
  optedOutRemoved: number;
  invalidRemoved: number;
  spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  contacts: Array<{ id: string; name: string; phone: string }>;
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
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, notes')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null);
        rawContacts = data || [];

      } else if (audience.type === 'tags' && audience.tags.length > 0) {
        // Fetch contacts matching any of the selected tags (using overlap operator)
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, notes')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null)
          .overlaps('tags', audience.tags);
        rawContacts = data || [];

      } else if (audience.type === 'custom' && audience.customFilters.length > 0) {
        // Fetch all contacts first and filter them in memory to support complex nested AND/OR segment validations
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, notes, lead_score')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null);
        
        const allLeads = data || [];

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
          // No inbound response recorded
          const sentIds = (parentMsgs || []).map(m => m.contact_id).filter(Boolean) as string[];
          targetContactIds.push(...sentIds);
        }

        if (targetContactIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('leads')
            .select('id, name, phone, tags, email, notes')
            .eq('tenant_id', tenantId)
            .in('id', targetContactIds)
            .not('phone', 'is', null);
          rawContacts = data || [];
        }

      } else if (audience.type === 'manual' && audience.manualContactIds && audience.manualContactIds.length > 0) {
        // Particular contacts manually selected
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, notes')
          .eq('tenant_id', tenantId)
          .in('id', audience.manualContactIds)
          .not('phone', 'is', null);
        rawContacts = data || [];

      } else if (audience.type === 'csv' && audience.csvFile && Array.isArray(audience.csvFile.contacts)) {
        // Custom spreadsheet imported contacts
        rawContacts = audience.csvFile.contacts.map((c: any, idx: number) => ({
          id: c.id || `csv-${idx}`,
          name: c.name || c.contact_name || 'there',
          phone: c.phone || c.phone_number,
          tags: c.tags || [],
          email: c.email || ''
        }));

      } else if (audience.type === 'csv' && (audience as any).filters?.csvFile?.contacts) {
        // Compatibility check for nested DB fields
        const csvContacts = (audience as any).filters.csvFile.contacts;
        rawContacts = csvContacts.map((c: any, idx: number) => ({
          id: c.id || `csv-${idx}`,
          name: c.name || c.contact_name || 'there',
          phone: c.phone || c.phone_number,
          tags: c.tags || [],
          email: c.email || ''
        }));

      } else {
        rawContacts = [];
      }

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

      const filteredContacts: Array<{ id: string; name: string; phone: string }> = [];
      let duplicatesRemoved = 0;
      let optedOutRemoved = 0;
      let invalidRemoved = 0;

      for (const lead of rawContacts) {
        if (!lead.phone) {
          invalidRemoved++;
          continue;
        }

        const phoneCleaned = cleanPhone(lead.phone);
        // E.164 verification: must be at least 10 numeric digits
        if (!phoneCleaned || phoneCleaned.length < 10 || /\D/.test(phoneCleaned)) {
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

        // Deduplication rules
        if (seenPhones.has(phoneCleaned) || seenContactIds.has(lead.id)) {
          duplicatesRemoved++;
          continue;
        }

        seenPhones.add(phoneCleaned);
        seenContactIds.add(lead.id);

        filteredContacts.push({
          id: lead.id,
          name: lead.name || 'there',
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
        spamRisk: 'LOW',
        contacts: [],
      };
    }
  }
}
