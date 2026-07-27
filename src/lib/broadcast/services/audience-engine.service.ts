import { supabaseAdmin } from '@/lib/supabase/admin';
import { AudienceState } from '@/app/dashboard/broadcast/types';
import { cleanPhone } from '@/lib/meta/service';
import { cleanContactName } from '@/lib/broadcast/recipient-name';
import { resolveTargetContacts } from './audience-targeting';

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
    // No top-level try/catch swallow: this used to catch any exception (a
    // transient DB error, a thrown fetchLeadsByFilter, a thrown
    // broadcast_deliveries query) and return `{total: 0, ...}` — indistinguishable
    // from "the filter genuinely matched zero contacts". launchCampaign() treats
    // total===0 as "nothing to send" and marks the campaign COMPLETED. A
    // transient failure therefore permanently terminated the campaign (not
    // re-launchable — 'completed' isn't in the re-launch allowlist) while
    // reporting success to the user. Let errors propagate so launchCampaign's
    // own catch returns a real, retryable failure instead.
    {
      // Targeting (audience type → contacts + additive manual selections) is
      // resolved by the single shared core (audience-targeting.ts) so the send,
      // estimate, preview, and readiness paths can never diverge on WHO an
      // audience targets. Compliance filtering stays below.
      const { contacts: rawContacts } = await resolveTargetContacts(tenantId, audience);

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

        // Note: WhatsApp approved templates can be sent to any valid number.
        // Consent enforcement (last_message_at / channel check) is NOT required
        // for template messages — Meta's own policy governs this at delivery time.
        // We only enforce opt-outs (explicit unsubscribes) which are below.

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
    }
  }
}
