import { supabaseAdmin } from '@/lib/supabase/admin';
import { AudienceState } from '@/app/dashboard/broadcast/types';
import { cleanPhone } from '@/lib/meta/service';
import { cleanContactName, logInvalidContactName, type ContactNameSource } from '@/lib/broadcast/recipient-name';
import { resolveTargetContacts } from './audience-targeting';

export interface RecipientRecord {
  campaign_id: string;
  tenant_id: string;
  contact_id: string | null;
  phone_number: string;
  name: string | null;
  email: string | null;
  source_type: string;
  source_label: string;
  status: 'eligible' | 'excluded' | 'duplicate_removed' | 'invalid' | 'opted_out' | 'no_consent';
  last_interaction_at: string | null;
  normalized_number: string | null;
}

export interface RecipientCacheResult {
  totalRecipients: number;
  excluded: number;
  duplicatesRemoved: number;
  invalidNumbers: number;
  noConsentRemoved: number;
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
    // No top-level swallow here either — same reasoning as
    // AudienceEngineService.resolveAudience. This is the "live estimate" path
    // (Recipients drawer / preview), not the launch-time queue path, but
    // silently returning a fake all-zero result on a DB error still misleads
    // the user while they're building the campaign. Both callers
    // (src/app/api/broadcast/recipients/route.ts) already have their own
    // try/catch that turns a thrown error into a real success:false response.
    {
      // Targeting (audience type → contacts + additive manual selections) is
      // resolved by the single shared core (audience-targeting.ts) — identical
      // to the send resolver, so the approved preview can never diverge from the
      // sent set. Compliance classification stays below (this path emits rich
      // per-recipient status records for the UI).
      const { contacts: mergedContacts, sourceLabel } = await resolveTargetContacts(tenantId, audience);

      // 2. Perform deduplication, compliance filters, and phone validations
      // Pre-fetch opt-out list from DB (the broadcast_optouts table is the authoritative source)
      const { data: optoutRows } = await supabaseAdmin
        .from('broadcast_optouts')
        .select('phone')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      const optoutPhones = new Set((optoutRows || []).map((r: { phone: string }) => r.phone));

      const seenPhones = new Set<string>();
      const seenContactIds = new Set<string>();
      const excludedIds = new Set((audience as any).excludedContactIds || []);

      const finalRecords: RecipientRecord[] = [];
      let totalRecipients = 0;
      let excluded = 0;
      let duplicatesRemoved = 0;
      let invalidNumbers = 0;
      let noConsentRemoved = 0;
      let normalizationCount = 0;

      for (const lead of mergedContacts) {
        const leadId = lead.id;
        const leadPhone = lead.phone;
        // Store the clean human name or null — NEVER a placeholder like "there".
        // The UI falls back to the phone number when this is null.
        const leadName = cleanContactName(lead.name);

        // Runtime validation + monitoring: if the source row CLAIMED a name but
        // it was a placeholder (now coerced to null), surface it so a bad import
        // is caught immediately — with tenant / contact / source / campaign.
        if (lead.name != null && String(lead.name).trim() !== '' && leadName === null) {
          logInvalidContactName({
            tenantId,
            campaignId,
            contactId: String(leadId).startsWith('csv-') ? null : leadId,
            source: (audience.type === 'csv' ? 'csv' : 'crm') as ContactNameSource,
            rawName: lead.name,
          });
        }
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
            normalized_number: (() => { try { return leadPhone ? cleanPhone(leadPhone) : null; } catch { return null; } })(),
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

        let phoneCleaned: string;
        try {
          phoneCleaned = cleanPhone(leadPhone);
        } catch {
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
        if (!phoneCleaned || phoneCleaned.length < 10) {
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

        // B. Opt-out check: DB optouts table (authoritative) + legacy tag-based opt-out
        const tagsList = lead.tags || [];
        const isOptedOutByTag = tagsList.some((t: string) =>
          t.toLowerCase() === 'opt-out' ||
          t.toLowerCase() === 'optout' ||
          t.toLowerCase() === 'unsubscribe' ||
          t.toLowerCase() === 'stop'
        );
        const isOptedOut = optoutPhones.has(phoneCleaned) || isOptedOutByTag;

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

        // Note: WhatsApp approved templates can be sent to any valid number.
        // Consent enforcement is NOT required for template messages — Meta governs
        // this at delivery time. We only enforce explicit opt-outs below.

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
        // Scope BOTH the delete and the insert to the transient preview cache
        // (frozen=false). A locked campaign's immutable send snapshot
        // (frozen=true, written by BroadcastEngineService.lockCampaignAndEnqueue)
        // must never be clobbered by a late preview re-estimate — that would
        // silently mutate what actually gets sent.
        await supabaseAdmin
          .from('broadcast_campaign_recipient_cache')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('campaign_id', campaignId)
          .eq('frozen', false);

        if (finalRecords.length > 0) {
          // Batch inserting in chunks of 200 rows for high reliability
          const chunkSize = 200;
          for (let i = 0; i < finalRecords.length; i += chunkSize) {
            const chunk = finalRecords.slice(i, i + chunkSize).map(rec => ({ ...rec, frozen: false }));
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
        noConsentRemoved,
        normalizationCount,
        recipients: finalRecords,
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
    // Same reasoning as resolveBroadcastAudience above — this outer catch used
    // to re-swallow whatever resolveBroadcastAudience threw (including after
    // that method's own fix) back into a fake all-zero result.
    {
      // Snapshot authority for reads: once a campaign is locked, the immutable
      // frozen snapshot IS the recipient list — prefer it over any transient
      // preview rows so stats/exports/analytics reflect exactly what was queued
      // and sent. Only unlaunched campaigns fall back to the preview cache /
      // dynamic resolution.
      // Tenant scoping is MANDATORY here: supabaseAdmin bypasses RLS and the
      // campaignId comes from the client, so filtering by campaign_id alone
      // would let a caller read another tenant's snapshot (names + phones) by
      // supplying that tenant's campaign UUID (IDOR).
      const { data: frozen } = await supabaseAdmin
        .from('broadcast_campaign_recipient_cache')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('campaign_id', campaignId)
        .eq('frozen', true);

      const { data, error } = (frozen && frozen.length > 0)
        ? { data: frozen, error: null }
        : await supabaseAdmin
            .from('broadcast_campaign_recipient_cache')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('campaign_id', campaignId)
            .eq('frozen', false);

      if (error || !data || data.length === 0) {
        // Fallback: Resolve dynamically from campaign targeting settings
        const { data: campaignAudience } = await supabaseAdmin
          .from('broadcast_audiences')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('campaign_id', campaignId)
          .maybeSingle();

        if (!campaignAudience) {
          return { totalRecipients: 0, excluded: 0, duplicatesRemoved: 0, invalidNumbers: 0, noConsentRemoved: 0, normalizationCount: 0, recipients: [] };
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
          csvFile: campaignAudience.filters?.csvFile || null,
          recentCount: campaignAudience.filters?.recentCount || 50,
        };

        return await this.resolveBroadcastAudience(tenantId, campaignId, audienceState);
      }

      // Convert cached rows back into result format
      const recipients = data as RecipientRecord[];
      const totalRecipients = recipients.filter(r => r.status === 'eligible').length;
      const excluded = recipients.filter(r => r.status === 'opted_out' || r.status === 'excluded').length;
      const duplicatesRemoved = recipients.filter(r => r.status === 'duplicate_removed').length;
      const invalidNumbers = recipients.filter(r => r.status === 'invalid').length;
      const noConsentRemoved = recipients.filter(r => r.status === 'no_consent').length;
      const normalizationCount = recipients.filter(r => r.status === 'eligible' && r.phone_number !== r.normalized_number).length;

      return {
        totalRecipients,
        excluded,
        duplicatesRemoved,
        invalidNumbers,
        noConsentRemoved,
        normalizationCount,
        recipients,
      };
    }
  }
}
