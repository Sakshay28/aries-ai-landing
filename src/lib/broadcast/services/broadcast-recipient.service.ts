import { supabaseAdmin } from '@/lib/supabase/admin';
import { AudienceState } from '@/app/dashboard/broadcast/types';
import { cleanPhone } from '@/lib/meta/service';

export interface RecipientRecord {
  campaign_id: string;
  tenant_id: string;
  contact_id: string | null;
  phone_number: string;
  name: string | null;
  email: string | null;
  source_type: string;
  source_label: string;
  status: 'eligible' | 'excluded' | 'duplicate_removed' | 'invalid' | 'opted_out';
  last_interaction_at: string | null;
  normalized_number: string | null;
}

export interface RecipientCacheResult {
  totalRecipients: number;
  excluded: number;
  duplicatesRemoved: number;
  invalidNumbers: number;
  normalizationCount: number;
  recipients: RecipientRecord[];
}

export class BroadcastRecipientService {
  /**
   * Resolves the entire audience, calculates eligibility, maps sources,
   * caches the list in the database (with self-healing fallback), and returns the results.
   */
  static async resolveBroadcastAudience(
    tenantId: string,
    campaignId: string,
    audience: AudienceState
  ): Promise<RecipientCacheResult> {
    try {
      let rawContacts: any[] = [];
      let sourceLabel = 'All Contacts';

      // 1. Fetch raw contacts based on targeting type
      if (audience.type === 'all') {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, last_message_at')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null);
        rawContacts = data || [];
        sourceLabel = 'All Contacts';

      } else if (audience.type === 'tags' && audience.tags.length > 0) {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, last_message_at')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null)
          .overlaps('tags', audience.tags);
        rawContacts = data || [];
        sourceLabel = `Tag → ${audience.tags.join(', ')}`;

      } else if (audience.type === 'custom' && audience.customFilters.length > 0) {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, last_message_at, lead_score')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null);
        
        const allLeads = data || [];
        rawContacts = allLeads.filter(lead => {
          return audience.customFilters.every(filter => {
            if (!filter.field || !filter.value) return true;
            const leadObj = lead as Record<string, any>;
            const leadVal = String(leadObj[filter.field] || leadObj[filter.field.toLowerCase()] || '').toLowerCase();
            const filterVal = filter.value.toLowerCase();

            if (filter.operator === '=') return leadVal === filterVal;
            if (filter.operator === 'contains') return leadVal.includes(filterVal);
            if (filter.operator === '>') return Number(leadVal) > Number(filterVal);
            if (filter.operator === '<') return Number(leadVal) < Number(filterVal);
            return true;
          });
        });
        sourceLabel = 'Segment Filter';

      } else if (audience.type === 'retarget' && audience.retargetCampaignId) {
        const { data: parentMsgs, error: parentMsgsErr } = await supabaseAdmin
          .from('broadcast_deliveries')
          .select('contact_id, status')
          .eq('campaign_id', audience.retargetCampaignId);

        if (parentMsgsErr) throw parentMsgsErr;

        const targetContactIds: string[] = [];
        if (audience.retargetCondition === 'unread') {
          const readIds = new Set((parentMsgs || []).filter(m => m.status === 'read').map(m => m.contact_id));
          (parentMsgs || []).forEach(m => {
            if (m.contact_id && !readIds.has(m.contact_id)) targetContactIds.push(m.contact_id);
          });
        } else if (audience.retargetCondition === 'no_reply') {
          const sentIds = (parentMsgs || []).map(m => m.contact_id).filter(Boolean) as string[];
          targetContactIds.push(...sentIds);
        }

        if (targetContactIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('leads')
            .select('id, name, phone, tags, email, last_message_at')
            .eq('tenant_id', tenantId)
            .in('id', targetContactIds)
            .not('phone', 'is', null);
          rawContacts = data || [];
        }
        sourceLabel = `Retargeting → ${audience.retargetCondition}`;

      } else if (audience.type === 'manual' && audience.manualContactIds && audience.manualContactIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, last_message_at')
          .eq('tenant_id', tenantId)
          .in('id', audience.manualContactIds)
          .not('phone', 'is', null);
        rawContacts = data || [];
        sourceLabel = 'Manual Selection';

      } else if (audience.type === 'csv' && audience.csvFile && Array.isArray(audience.csvFile.contacts)) {
        rawContacts = audience.csvFile.contacts.map((c: any, idx: number) => ({
          id: c.id || `csv-${idx}`,
          name: c.name || c.contact_name || 'there',
          phone: c.phone || c.phone_number,
          tags: c.tags || [],
          email: c.email || '',
          last_message_at: null
        }));
        sourceLabel = 'CSV Upload';
      }

      // Fetch manual overrides if they exist
      let manualLeads: any[] = [];
      const manualIds = audience.manualContactIds || [];
      if (manualIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, name, phone, tags, email, last_message_at')
          .eq('tenant_id', tenantId)
          .in('id', manualIds)
          .not('phone', 'is', null);
        manualLeads = data || [];
      }

      // Merge targeted contacts and manual additions
      const targetedIds = new Set(rawContacts.map(c => c.id));
      const manualAdditions = manualLeads.filter(c => !targetedIds.has(c.id));
      
      const mergedContacts = [
        ...rawContacts.map(c => ({ ...c, isManualAddition: false })),
        ...manualAdditions.map(c => ({ ...c, isManualAddition: true }))
      ];

      // 2. Perform deduplication, compliance filters, and phone validations
      const seenPhones = new Set<string>();
      const seenContactIds = new Set<string>();
      const excludedIds = new Set((audience as any).excludedContactIds || []);

      const finalRecords: RecipientRecord[] = [];
      let totalRecipients = 0;
      let excluded = 0;
      let duplicatesRemoved = 0;
      let invalidNumbers = 0;
      let normalizationCount = 0;

      for (const lead of mergedContacts) {
        const leadId = lead.id;
        const leadPhone = lead.phone;
        const leadName = lead.name || 'there';
        const leadEmail = lead.email || null;
        const lastMsgAt = lead.last_message_at || null;
        const isManualAddition = (lead as any).isManualAddition || false;

        const recordSourceLabel = isManualAddition ? 'Manual Override' : sourceLabel;
        const recordSourceType = isManualAddition ? 'manual' : audience.type;

        // Check manual exclusions first
        if (excludedIds.has(leadId)) {
          excluded++;
          finalRecords.push({
            campaign_id: campaignId,
            tenant_id: tenantId,
            contact_id: leadId.startsWith('csv-') ? null : leadId,
            phone_number: leadPhone || '',
            name: leadName,
            email: leadEmail,
            source_type: recordSourceType,
            source_label: recordSourceLabel,
            status: 'excluded',
            last_interaction_at: lastMsgAt,
            normalized_number: leadPhone ? cleanPhone(leadPhone) : null,
          });
          continue;
        }

        // A. Phone number validity check
        if (!leadPhone) {
          invalidNumbers++;
          finalRecords.push({
            campaign_id: campaignId,
            tenant_id: tenantId,
            contact_id: leadId.startsWith('csv-') ? null : leadId,
            phone_number: '',
            name: leadName,
            email: leadEmail,
            source_type: recordSourceType,
            source_label: recordSourceLabel,
            status: 'invalid',
            last_interaction_at: lastMsgAt,
            normalized_number: null,
          });
          continue;
        }

        const phoneCleaned = cleanPhone(leadPhone);
        if (!phoneCleaned || phoneCleaned.length < 10 || /\D/.test(phoneCleaned)) {
          invalidNumbers++;
          finalRecords.push({
            campaign_id: campaignId,
            tenant_id: tenantId,
            contact_id: leadId.startsWith('csv-') ? null : leadId,
            phone_number: leadPhone,
            name: leadName,
            email: leadEmail,
            source_type: recordSourceType,
            source_label: recordSourceLabel,
            status: 'invalid',
            last_interaction_at: lastMsgAt,
            normalized_number: null,
          });
          continue;
        }

        if (phoneCleaned !== leadPhone) {
          normalizationCount++;
        }

        // B. Opt-out tag checks
        const tagsList = lead.tags || [];
        const isOptedOut = tagsList.some((t: string) =>
          t.toLowerCase() === 'opt-out' ||
          t.toLowerCase() === 'optout' ||
          t.toLowerCase() === 'unsubscribe' ||
          t.toLowerCase() === 'stop'
        );

        if (isOptedOut) {
          excluded++;
          finalRecords.push({
            campaign_id: campaignId,
            tenant_id: tenantId,
            contact_id: leadId.startsWith('csv-') ? null : leadId,
            phone_number: phoneCleaned,
            name: leadName,
            email: leadEmail,
            source_type: recordSourceType,
            source_label: recordSourceLabel,
            status: 'opted_out',
            last_interaction_at: lastMsgAt,
            normalized_number: phoneCleaned,
          });
          continue;
        }

        // C. Deduplication check
        if (seenPhones.has(phoneCleaned) || seenContactIds.has(leadId)) {
          duplicatesRemoved++;
          finalRecords.push({
            campaign_id: campaignId,
            tenant_id: tenantId,
            contact_id: leadId.startsWith('csv-') ? null : leadId,
            phone_number: phoneCleaned,
            name: leadName,
            email: leadEmail,
            source_type: recordSourceType,
            source_label: recordSourceLabel,
            status: 'duplicate_removed',
            last_interaction_at: lastMsgAt,
            normalized_number: phoneCleaned,
          });
          continue;
        }

        seenPhones.add(phoneCleaned);
        seenContactIds.add(leadId);

        // D. Eligible contact
        totalRecipients++;
        finalRecords.push({
          campaign_id: campaignId,
          tenant_id: tenantId,
          contact_id: leadId.startsWith('csv-') ? null : leadId,
          phone_number: phoneCleaned,
          name: leadName,
          email: leadEmail,
          source_type: recordSourceType,
          source_label: recordSourceLabel,
          status: 'eligible',
          last_interaction_at: lastMsgAt,
          normalized_number: phoneCleaned,
        });
      }

      // 3. Cache the resolved list in the database (wrapped in self-healing try-catch)
      try {
        await supabaseAdmin
          .from('broadcast_campaign_recipient_cache')
          .delete()
          .eq('campaign_id', campaignId);

        if (finalRecords.length > 0) {
          // Batch inserting in chunks of 200 rows for high reliability
          const chunkSize = 200;
          for (let i = 0; i < finalRecords.length; i += chunkSize) {
            const chunk = finalRecords.slice(i, i + chunkSize);
            const { error: insertErr } = await supabaseAdmin
              .from('broadcast_campaign_recipient_cache')
              .insert(chunk);
            if (insertErr) throw insertErr;
          }
        }
      } catch (dbErr: any) {
        console.warn(
          '⚠️ DB recipient cache write failed (continuing in-memory):',
          dbErr.message || dbErr
        );
      }

      return {
        totalRecipients,
        excluded,
        duplicatesRemoved,
        invalidNumbers,
        normalizationCount,
        recipients: finalRecords,
      };

    } catch (err: any) {
      console.error('❌ Failed to resolve broadcast audience:', err);
      return {
        totalRecipients: 0,
        excluded: 0,
        duplicatesRemoved: 0,
        invalidNumbers: 0,
        normalizationCount: 0,
        recipients: [],
      };
    }
  }

  /**
   * Retrieves recipients for a campaign. First checks the cache table,
   * falls back to dynamic resolution if the table is empty or missing.
   */
  static async getCampaignRecipients(
    tenantId: string,
    campaignId: string
  ): Promise<RecipientCacheResult> {
    try {
      const { data, error } = await supabaseAdmin
        .from('broadcast_campaign_recipient_cache')
        .select('*')
        .eq('campaign_id', campaignId);

      if (error || !data || data.length === 0) {
        // Fallback: Resolve dynamically from campaign targeting settings
        const { data: campaignAudience } = await supabaseAdmin
          .from('broadcast_audiences')
          .select('*')
          .eq('campaign_id', campaignId)
          .maybeSingle();

        if (!campaignAudience) {
          return { totalRecipients: 0, excluded: 0, duplicatesRemoved: 0, invalidNumbers: 0, normalizationCount: 0, recipients: [] };
        }

        const audienceState: AudienceState = {
          type: campaignAudience.audience_type,
          tags: campaignAudience.tag_ids || [],
          customFilters: campaignAudience.filters?.customFilters || [],
          retargetCampaignId: campaignAudience.csv_upload_id || null,
          retargetCondition: campaignAudience.filters?.retargetCondition || 'unread',
          retargetDelayDays: campaignAudience.filters?.retargetDelayDays || 1,
          manualContactIds: campaignAudience.filters?.manualContactIds || [],
          excludedContactIds: campaignAudience.filters?.excludedContactIds || [],
          csvFile: campaignAudience.filters?.csvFile || null
        };

        return await this.resolveBroadcastAudience(tenantId, campaignId, audienceState);
      }

      // Convert cached rows back into result format
      const recipients = data as RecipientRecord[];
      const totalRecipients = recipients.filter(r => r.status === 'eligible').length;
      const excluded = recipients.filter(r => r.status === 'opted_out' || r.status === 'excluded').length;
      const duplicatesRemoved = recipients.filter(r => r.status === 'duplicate_removed').length;
      const invalidNumbers = recipients.filter(r => r.status === 'invalid').length;
      const normalizationCount = recipients.filter(r => r.status === 'eligible' && r.phone_number !== r.normalized_number).length;

      return {
        totalRecipients,
        excluded,
        duplicatesRemoved,
        invalidNumbers,
        normalizationCount,
        recipients,
      };

    } catch (err) {
      console.error('Failed to get campaign recipients:', err);
      return { totalRecipients: 0, excluded: 0, duplicatesRemoved: 0, invalidNumbers: 0, normalizationCount: 0, recipients: [] };
    }
  }
}
