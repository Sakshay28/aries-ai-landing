import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage, MetaApiError } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { AudienceEngineService } from './audience-engine.service';
import { MetaPayloadBuilderService } from './meta-payload-builder.service';
import { TemplateParserService } from './template-parser.service';
import { MetaTemplateSyncService } from './meta-template-sync.service';
import { ExecutionEventService } from './execution-event.service';
import { notifyAdmin } from '@/lib/alerts/admin';
import { pushToDLQ } from '@/lib/queue/deadLetter';
import { TokenBucket, metaTierCap, remainingTierBudget } from './rate-limiter';

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 30, 60];
// Cap for Meta rate/tier-limit re-queues, which historically never incremented
// attempt_count ("don't burn a real attempt on a throttle") and so could retry
// forever for a recipient that keeps hitting a persistent limit. This is a much
// longer leash than RETRY_BACKOFF_MINUTES (throttles are expected to be
// transient) but it is still finite — see the catch block in
// processItemsForTenant for how it terminates into the normal DLQ path.
const MAX_THROTTLE_ATTEMPTS = 20;

interface ProcessOpts {
  forceNow?: boolean;
  // Per-number pacer. Supplied by the persistent worker so sustained throughput
  // stays under Meta's limit. Omitted by the Vercel backstop (tiny batches).
  limiter?: TokenBucket;
}

export class BroadcastEngineService {
  /**
   * Resolves the target audience cohort, E.164 formats them, filters opt-outs,
   * and populates the database queue table in pending state.
   */
  static async launchCampaign(tenantId: string, campaignId: string): Promise<{ success: boolean; queuedCount?: number; error?: string }> {
    try {
      // 1. Fetch Campaign Core — always filter by tenant_id to prevent cross-tenant access
      const { data: campaign } = await supabaseAdmin
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('tenant_id', tenantId)
        .single();

      if (!campaign) {
        return { success: false, error: 'Campaign not found' };
      }

      // Guard against re-launch AND concurrent double-launch. There are two live
      // UI entry points that both reach this function on a 'draft' campaign
      // (/api/broadcast/launch and /api/broadcasts/send) — a plain read-then-branch
      // status check lets two near-simultaneous calls both pass, both resolve the
      // audience, and both write (the queue insert is idempotent, but the
      // broadcast_analytics upsert below was not, and the resolution work itself
      // is wastefully duplicated). CAS-claim 'draft' -> 'launching' atomically so
      // only one caller proceeds. 'scheduled' and 'launching' starts are already
      // exclusively owned by SchedulerService's own CAS claim before it calls this
      // function, so they pass straight through without re-claiming here.
      if (campaign.status === 'draft') {
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from('broadcast_campaigns')
          .update({ status: 'launching', updated_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('tenant_id', tenantId)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle();
        if (claimErr || !claimed) {
          return { success: false, error: 'Campaign launch already in progress — duplicate request ignored.' };
        }
      } else if (!['scheduled', 'launching'].includes(campaign.status)) {
        return { success: false, error: `Campaign is already "${campaign.status}". Cannot re-launch — duplicate sends prevented.` };
      }

      // 1b. Server-side template-approval gate. The UI's pre-flight check
      // (CampaignReview/BroadcastBuilder) only compares against the client's
      // possibly-stale cached template object and is not enforced server-side —
      // a direct API call (or a stale page) could otherwise launch a REJECTED or
      // never-synced template straight through to every recipient, only failing
      // (correctly, but wastefully and later) once each send hits Meta.
      if (campaign.template_name) {
        let { data: cachedTemplate } = await supabaseAdmin
          .from('broadcast_templates_cache')
          .select('status')
          .eq('name', campaign.template_name)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        // Nothing in the codebase syncs this cache proactively (no cron, no
        // UI action) — a tenant's very first launch of a template would always
        // find it empty here. Sync on demand once rather than hard-failing on
        // a cache that was never given a chance to be populated.
        if (!cachedTemplate) {
          await MetaTemplateSyncService.syncTemplates(tenantId);
          ({ data: cachedTemplate } = await supabaseAdmin
            .from('broadcast_templates_cache')
            .select('status')
            .eq('name', campaign.template_name)
            .eq('tenant_id', tenantId)
            .maybeSingle());
        }

        const templateStatus = cachedTemplate?.status || 'UNKNOWN';
        if (templateStatus === 'REJECTED') {
          return { success: false, error: `Template "${campaign.template_name}" was REJECTED by Meta and cannot be sent. Choose a different template.` };
        }
        if (templateStatus === 'UNKNOWN') {
          return { success: false, error: `Template "${campaign.template_name}" approval status is unknown. Sync templates from Meta before launching.` };
        }
      }

      // 2. Fetch audience targeting parameters
      const { data: audienceConfig } = await supabaseAdmin
        .from('broadcast_audiences')
        .select('*')
        .eq('campaign_id', campaignId)
        .maybeSingle();

      if (!audienceConfig) {
        return { success: false, error: 'Campaign audience configurations not set' };
      }

      // 3. Resolve CRM contacts list using the Audience Engine
      const resolved = await AudienceEngineService.resolveAudience(tenantId, {
        type: audienceConfig.audience_type,
        tags: audienceConfig.tag_ids || [],
        customFilters: audienceConfig.filters?.customFilters || [],
        retargetCampaignId: audienceConfig.csv_upload_id || null,
        retargetCondition: audienceConfig.filters?.retargetCondition || 'unread',
        retargetDelayDays: audienceConfig.filters?.retargetDelayDays || 1,
        manualContactIds: audienceConfig.filters?.manualContactIds || [],
        excludedContactIds: audienceConfig.filters?.excludedContactIds || [],
        csvFile: audienceConfig.filters?.csvFile || null,
      });

      if (resolved.total === 0) {
        // Complete the campaign instantly if there are no qualified recipients
        await supabaseAdmin
          .from('broadcast_campaigns')
          .update({ status: 'completed', audience_count: 0, updated_at: new Date().toISOString() })
          .eq('id', campaignId);
        return { success: true, queuedCount: 0 };
      }

      // 4. Batch enqueuing leads into broadcast_queue
      const now = new Date().toISOString();
      const templateLanguage = campaign.template_language || 'en';
      const queueEntries = resolved.contacts.map(contact => {
        const isCsvContact = typeof contact.id === 'string' && contact.id.startsWith('csv-');
        return {
          tenant_id:       tenantId,
          campaign_id:     campaignId,
          contact_id:      isCsvContact ? null : contact.id,
          phone:           contact.phone,
          status:          'pending',
          attempt_count:   0,
          next_attempt_at: now,
          language_code:   templateLanguage,
          payload: {
            name: contact.name,
          },
        };
      });

      // Ingest in chunks of 500. Use upsert with onConflict to be idempotent:
      // if the unique constraint (campaign_id, contact_id) already exists (double-click/retry),
      // DO NOTHING rather than inserting a duplicate row.
      const chunkSize = 500;
      for (let i = 0; i < queueEntries.length; i += chunkSize) {
        const chunk = queueEntries.slice(i, i + chunkSize);
        const { error: insertErr } = await supabaseAdmin
          .from('broadcast_queue')
          .upsert(chunk, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });
        if (insertErr) throw insertErr;
      }

      // 5. Transition Campaign status to sending
      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({
          status: 'sending',
          audience_count: resolved.total,
          spam_risk: resolved.spamRisk,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId);

      // Create default analytics record. ignoreDuplicates so a re-entrant call
      // (e.g. scheduler retry after a partial prior failure) can never reset an
      // existing row's real counts back to zero.
      await supabaseAdmin
        .from('broadcast_analytics')
        .upsert({
          campaign_id: campaignId,
          tenant_id: tenantId,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          failed_count: 0
        }, { onConflict: 'campaign_id', ignoreDuplicates: true });

      return { success: true, queuedCount: resolved.total };

    } catch (e) {
      console.error('❌ Launch Campaign Engine failed:', e);
      return { success: false, error: (e as Error).message || 'Failed to start campaign dispatch' };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GLOBAL DRAIN (Vercel backstop). Claims one batch across ALL tenants and
  // processes it. The persistent worker uses processTenantQueue() per tenant for
  // true parallelism + fairness; this remains as a safety net if the worker is
  // down. Kept behaviorally identical to the pre-refactor version.
  // ───────────────────────────────────────────────────────────────────────────
  static async processQueue(limit = 100, forceNow = false): Promise<number> {
    try {
      await this.resetStaleProcessing();

      if (forceNow) {
        await supabaseAdmin
          .from('broadcast_queue')
          .update({ next_attempt_at: null })
          .eq('status', 'pending')
          .is('locked_at', null)
          .gt('next_attempt_at', new Date().toISOString());
      }

      const queueItems = await this.claimGlobalBatch(limit);
      if (!queueItems || queueItems.length === 0) {
        console.log('[QUEUE_JOB] No pending items found in broadcast_queue');
        return 0;
      }

      console.log(`[QUEUE_JOB] Processing ${queueItems.length} queue items`);

      // Group by tenant and process each group with the shared per-tenant routine.
      const tenantGroupMap = new Map<string, any[]>();
      queueItems.forEach(item => {
        const list = tenantGroupMap.get(item.tenant_id) || [];
        list.push(item);
        tenantGroupMap.set(item.tenant_id, list);
      });

      let processed = 0;
      for (const [tenantId, items] of tenantGroupMap.entries()) {
        processed += await this.processItemsForTenant(tenantId, items, { forceNow });
      }
      return processed;
    } catch (e) {
      console.error('❌ Background cron processQueue failed:', e);
      return 0;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PER-TENANT DRAIN (persistent worker lane). Claims a tenant-scoped batch via
  // SKIP LOCKED, enforces the Meta 24h messaging-tier budget, and paces sends
  // through the supplied TokenBucket. This is what makes 100 tenants send in
  // parallel without one campaign starving the others.
  // ───────────────────────────────────────────────────────────────────────────
  static async processTenantQueue(tenantId: string, limit: number, opts: ProcessOpts = {}): Promise<number> {
    try {
      // Enforce the Meta messaging-tier 24h budget BEFORE claiming work. Sending
      // past the tier is what collapses the number's quality rating.
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('wa_messaging_tier, wa_daily_conversation_cap')
        .eq('id', tenantId)
        .single();

      const cap = metaTierCap(tenant?.wa_messaging_tier, tenant?.wa_daily_conversation_cap);
      let claimLimit = limit;
      if (Number.isFinite(cap)) {
        const { data: sent24h } = await supabaseAdmin
          .rpc('count_tenant_unique_recipients_24h', { p_tenant_id: tenantId });
        const remaining = remainingTierBudget(cap, Number(sent24h ?? 0));
        if (remaining <= 0) {
          notifyAdmin({
            dedupeKey: `broadcast-tier-budget-${tenantId}`,
            subject: `Broadcast paused — Meta 24h tier budget reached`,
            summary: `Tenant ${tenantId} hit its ${cap}-recipient/24h messaging tier. Remaining sends deferred to the next window to protect the number's quality rating.`,
            context: { tenantId, tierCap: cap, sent24h: Number(sent24h ?? 0) },
          }).catch(() => {});
          return 0;
        }
        claimLimit = Math.min(limit, remaining);
      }

      const { data: items, error } = await supabaseAdmin
        .rpc('claim_broadcast_batch_for_tenant', { p_tenant_id: tenantId, batch_limit: claimLimit });

      if (error) {
        console.error(`[WORKER] claim_broadcast_batch_for_tenant failed for ${tenantId}:`, error.message);
        return 0;
      }
      if (!items || items.length === 0) return 0;

      return await this.processItemsForTenant(tenantId, items, opts);
    } catch (e) {
      console.error(`❌ processTenantQueue failed for ${tenantId}:`, e);
      return 0;
    }
  }

  /** Unlock items stuck in 'processing' for >10 min (crashed/killed runs). */
  static async resetStaleProcessing(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    // The Supabase client resolves with {error} rather than throwing on a
    // query-level failure — this used to be discarded entirely (result never
    // even captured), so a permission/schema issue here would silently mean
    // stale 'processing' rows are NEVER recovered, with no log and no alert.
    // Since a campaign only reaches 'completed' when its queue has zero
    // pending/retrying/processing rows, that's a direct path to a campaign
    // stuck on 'sending' forever after any crash mid-batch.
    const { error } = await supabaseAdmin
      .from('broadcast_queue')
      .update({ status: 'pending', locked_at: null })
      .eq('status', 'processing')
      .lt('locked_at', staleThreshold);
    if (error) {
      console.error('❌ resetStaleProcessing failed — stale processing rows were NOT recovered:', error.message);
    }
  }

  /** Atomically claim a global batch (RPC, with a two-step fallback if missing). */
  private static async claimGlobalBatch(limit: number): Promise<any[] | null> {
    const { data: atomicItems, error: lockErr } = await supabaseAdmin
      .rpc('lock_broadcast_queue_batch', { batch_limit: limit });

    if (!lockErr) return atomicItems;

    console.warn('[QUEUE_JOB] Atomic lock RPC unavailable, using two-step fallback:', lockErr.message);
    const nowIso = new Date().toISOString();
    const { data: fallbackItems } = await supabaseAdmin
      .from('broadcast_queue')
      .select('*')
      .in('status', ['pending', 'retrying'])
      .is('locked_at', null)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fallbackItems && fallbackItems.length > 0) {
      const ids = fallbackItems.map((item: any) => item.id);
      await supabaseAdmin
        .from('broadcast_queue')
        .update({ locked_at: new Date().toISOString(), status: 'processing' })
        .in('id', ids);
      return fallbackItems;
    }
    return null;
  }

  /**
   * Core dispatcher for one tenant's already-claimed batch. Enforces throttling,
   * quiet hours, opt-outs, frequency caps, exponential backoff, DLQ on permanent
   * failure, and updates statuses. Shared by both the global and per-tenant paths.
   */
  private static async processItemsForTenant(tenantId: string, items: any[], opts: ProcessOpts = {}): Promise<number> {
    const { forceNow = false, limiter } = opts;
    let processed = 0;

    // A. Resolve tenant credentials and local settings
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id, timezone')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      await supabaseAdmin
        .from('broadcast_queue')
        .update({
          status: 'failed',
          failure_reason: 'Meta credentials not active or missing',
          processed_at: new Date().toISOString(),
          locked_at: null
        })
        .in('id', items.map(i => i.id));
      notifyAdmin({
        dedupeKey: `broadcast-no-creds-${tenantId}`,
        subject: `Broadcast failed — tenant missing WhatsApp credentials`,
        summary: `Tenant ${tenantId} has ${items.length} queued messages but no Meta access token or phone number ID. All messages permanently failed.`,
        context: { tenantId, failedCount: items.length, campaignIds: [...new Set(items.map(i => i.campaign_id))] },
      }).catch(() => {});
      return 0;
    }

    const accessToken = decryptToken(tenant.wa_access_token) as string;

    // B. Pre-fetch opt-out list for just-in-time filtering at send time.
    const { data: optoutRows } = await supabaseAdmin
      .from('broadcast_optouts')
      .select('phone')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    const optoutPhones = new Set((optoutRows || []).map((r: { phone: string }) => r.phone));

    // C. Pre-fetch campaign data, variable mappings, and template cache ONCE per
    //    unique campaign in this tenant batch — avoids N identical DB round-trips.
    const uniqueCampaignIds = [...new Set(items.map(i => i.campaign_id))];
    const campaignCache    = new Map<string, any>();
    const varIndicesCache  = new Map<string, string[]>();
    const varMapCache      = new Map<string, Record<string, any>>();
    const deliverySettingsCache = new Map<string, any>();

    const [campResults, settingsResults] = await Promise.all([
      Promise.all(uniqueCampaignIds.map(cid => supabaseAdmin.from('broadcast_campaigns').select('*').eq('id', cid).single())),
      Promise.all(uniqueCampaignIds.map(cid => supabaseAdmin.from('broadcast_delivery_settings').select('*').eq('campaign_id', cid).maybeSingle())),
    ]);
    campResults.forEach(({ data: camp }, i) => {
      if (camp) campaignCache.set(uniqueCampaignIds[i], camp);
    });
    settingsResults.forEach(({ data: settings }, i) => {
      if (settings) deliverySettingsCache.set(uniqueCampaignIds[i], settings);
    });

    await Promise.all(uniqueCampaignIds.map(async (cid) => {
      const camp = campaignCache.get(cid);
      if (!camp) return;

      const [{ data: mappings }, { data: tmpl }] = await Promise.all([
        supabaseAdmin.from('broadcast_variable_mapping').select('*').eq('campaign_id', cid),
        supabaseAdmin.from('broadcast_templates_cache').select('template_json')
          .eq('tenant_id', tenantId).eq('name', camp.template_name).maybeSingle(),
      ]);

      const vMap: Record<string, any> = {};
      (mappings || []).forEach((v: any) => {
        vMap[v.variable_key] = { index: v.variable_key, sourceType: v.source_type, crmField: v.crm_field, staticValue: v.custom_value };
      });

      let indices = [...new Set((mappings || []).map((v: any) => String(v.variable_key)))].sort((a, b) => Number(a) - Number(b));

      if (indices.length === 0 && tmpl?.template_json) {
        const parsed = TemplateParserService.parse(tmpl.template_json);
        if (parsed.detectedVariables.length > 0) {
          indices = parsed.detectedVariables;
          parsed.detectedVariables.forEach((idx, i) => {
            vMap[idx] = { index: idx, sourceType: i === 0 ? 'crm_field' : 'static', crmField: i === 0 ? 'name' : undefined, staticValue: i === 0 ? undefined : ' ' };
          });
        }
      }

      varMapCache.set(cid, vMap);
      varIndicesCache.set(cid, indices);
    }));

    // D. Process enqueued messages using cached campaign data
    const consecutiveFailures = new Map<string, number>();
    const campaignLiveStatusCache = new Map<string, string>();
    for (const item of items) {
      try {
        const campaign          = campaignCache.get(item.campaign_id);
        const variablesMap      = varMapCache.get(item.campaign_id) || {};
        const detectedVarIndices = varIndicesCache.get(item.campaign_id) || [];

        if (!campaign) {
          await supabaseAdmin
            .from('broadcast_queue')
            .update({ status: 'failed', failure_reason: 'Campaign configuration missing', locked_at: null })
            .eq('id', item.id);
          continue;
        }

        // Pause-on-failure: if 5 consecutive sends to this campaign failed, pause it
        const cid = item.campaign_id;
        if ((consecutiveFailures.get(cid) ?? 0) >= 5) {
          await supabaseAdmin
            .from('broadcast_campaigns')
            .update({ status: 'paused', updated_at: new Date().toISOString() })
            .eq('id', cid)
            .eq('status', 'sending');
          await supabaseAdmin
            .from('broadcast_queue')
            .update({ status: 'pending', locked_at: null })
            .eq('id', item.id);
          console.warn(`[BROADCAST] Campaign ${cid} paused — 5 consecutive failures`);
          notifyAdmin({
            dedupeKey: `broadcast-paused-${cid}`,
            subject: `Broadcast campaign auto-paused — 5 consecutive failures`,
            summary: `Campaign ${cid} for tenant ${tenantId} was paused after 5 consecutive send failures. Likely cause: expired Meta token or template rejected.`,
            context: { tenantId, campaignId: cid },
          }).catch(() => {});
          // Previously only the platform admin was told (via notifyAdmin, email).
          // The campaign OWNER's own timeline (BroadcastExecutionTimeline.tsx)
          // showed nothing — their campaign just silently stopped progressing.
          ExecutionEventService.logEvent(
            tenantId, cid, 'campaign_auto_paused', 'Campaign auto-paused',
            '5 consecutive sends failed in a row — pausing to avoid burning through the rest of the audience. Common causes: WhatsApp token expired/revoked, or the template was rejected by Meta. Use Retry Now after fixing the cause.',
            'error'
          ).catch(() => {});
          processed++;
          continue;
        }

        // Quiet hours enforcement: skip sends between 9 PM and 9 AM in campaign timezone.
        const dSettings = deliverySettingsCache.get(item.campaign_id);
        if (dSettings?.quiet_hours && !forceNow) {
          const tz = dSettings.timezone || 'Asia/Kolkata';
          const localHour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
          const h = parseInt(localHour, 10);
          if (h >= 21 || h < 9) {
            await supabaseAdmin
              .from('broadcast_queue')
              .update({ status: 'pending', locked_at: null })
              .eq('id', item.id);
            processed++;
            continue;
          }
        }

        // Check if campaign was cancelled/paused mid-send.
        if (!campaignLiveStatusCache.has(item.campaign_id)) {
          const { data: liveRow } = await supabaseAdmin
            .from('broadcast_campaigns')
            .select('status, updated_at, auto_resumed')
            .eq('id', item.campaign_id)
            .single();
          const st = liveRow?.status || 'unknown';

          if (st === 'paused' && liveRow?.updated_at && !liveRow?.auto_resumed) {
            const pausedAgo = Date.now() - new Date(liveRow.updated_at).getTime();
            if (pausedAgo > 30 * 60 * 1000) {
              await supabaseAdmin
                .from('broadcast_campaigns')
                .update({ status: 'sending', auto_resumed: true, updated_at: new Date().toISOString() })
                .eq('id', item.campaign_id);
              campaignLiveStatusCache.set(item.campaign_id, 'sending');
              console.log(`[BROADCAST] Auto-resumed campaign ${item.campaign_id} after 30-min cooldown`);
              notifyAdmin({
                dedupeKey: `broadcast-autoresume-${item.campaign_id}`,
                subject: `Broadcast campaign auto-resumed after 30-min cooldown`,
                summary: `Campaign ${item.campaign_id} (tenant ${tenantId}) was auto-resumed. If it pauses again, it will stay paused permanently — manual Retry Now required.`,
                context: { tenantId, campaignId: item.campaign_id },
              }).catch(() => {});
              ExecutionEventService.logEvent(
                tenantId, item.campaign_id, 'campaign_auto_resumed', 'Campaign auto-resumed',
                'Resumed automatically 30 minutes after an auto-pause. If it pauses again, it will stay paused — the underlying cause needs fixing, then use Retry Now.',
                'warning'
              ).catch(() => {});
            } else {
              campaignLiveStatusCache.set(item.campaign_id, st);
            }
          } else {
            campaignLiveStatusCache.set(item.campaign_id, st);
          }
        }
        const liveStatus = campaignLiveStatusCache.get(item.campaign_id);
        if (liveStatus === 'cancelled' || liveStatus === 'paused') {
          await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: liveStatus === 'cancelled' ? 'cancelled' : 'pending',
              locked_at: null,
              processed_at: liveStatus === 'cancelled' ? new Date().toISOString() : null,
            })
            .eq('id', item.id);
          processed++;
          continue;
        }

        // Just-in-time opt-out check
        if (optoutPhones.has(item.phone)) {
          await supabaseAdmin
            .from('broadcast_queue')
            .update({ status: 'cancelled', failure_reason: 'Recipient opted out', locked_at: null, processed_at: new Date().toISOString() })
            .eq('id', item.id);
          processed++;
          continue;
        }

        // Per-contact frequency cap: max 3 broadcasts per phone per 24h per tenant
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: recentSends } = await supabaseAdmin
          .from('broadcast_contact_sends')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('phone', item.phone)
          .gte('sent_at', oneDayAgo);
        if ((recentSends ?? 0) >= 3) {
          await supabaseAdmin
            .from('broadcast_queue')
            .update({ status: 'cancelled', failure_reason: 'Frequency cap: 3 broadcasts/day exceeded', locked_at: null, processed_at: new Date().toISOString() })
            .eq('id', item.id);
          processed++;
          continue;
        }

        const leadRecord = {
          id: item.contact_id || '',
          // Pass the raw stored name through; the variable engine sanitizes it
          // and applies the neutral greeting fallback when it is missing.
          name: item.payload?.name ?? null,
          phone: item.phone
        };

        const metaComponents = MetaPayloadBuilderService.buildPayload(
          variablesMap,
          detectedVarIndices,
          leadRecord
        );

        const languageCode = item.language_code || campaign.template_language || 'en';

        // Pace the SUSTAINED send rate to the number's safe throughput.
        if (limiter) await limiter.remove(1);

        // Dispatch to Meta
        const waResult = await sendTemplateMessage(
          accessToken,
          tenant.wa_phone_number_id,
          item.phone,
          campaign.template_name,
          metaComponents,
          languageCode
        );

        console.log(`[WHATSAPP_SEND] Dispatched to ${item.phone}: messageId=${waResult.messageId || 'NONE'}`);

        if (waResult.messageId) {
          await supabaseAdmin
            .from('broadcast_queue')
            .update({ status: 'sent', processed_at: new Date().toISOString(), locked_at: null })
            .eq('id', item.id);

          await supabaseAdmin
            .from('broadcast_deliveries')
            .upsert({
              tenant_id: tenantId,
              campaign_id: item.campaign_id,
              contact_id: item.contact_id,
              phone: item.phone,
              message_id: waResult.messageId,
              status: 'sent'
            }, { onConflict: 'message_id', ignoreDuplicates: false });

          await supabaseAdmin.rpc('increment_campaign_counter', {
            p_campaign_id: item.campaign_id,
            p_status: 'sent',
          });

          await supabaseAdmin.from('broadcast_contact_sends').insert({
            tenant_id: tenantId,
            phone: item.phone,
            campaign_id: item.campaign_id,
          });

          consecutiveFailures.set(item.campaign_id, 0);
        } else {
          throw new Error('Missing outbound messageId');
        }

      } catch (err) {
        const errorMsg = (err as Error).message || 'Unknown network error';
        console.error(`❌ Meta dispatch failure to ${item.phone}:`, errorMsg);
        consecutiveFailures.set(item.campaign_id, (consecutiveFailures.get(item.campaign_id) ?? 0) + 1);

        // A Meta tier/rate limit means "slow down", not "this recipient is bad" —
        // defer without burning a normal retry attempt. This must still be
        // BOUNDED: a recipient that keeps hitting a persistent Meta pair-rate/tier
        // limit used to retry here forever (attempt_count was never touched on
        // this path, so RETRY_BACKOFF_MINUTES's cap never applied) — the queue
        // item, and therefore the whole campaign (which only completes when its
        // queue is empty), could never reach a terminal state. Give throttles
        // their own, much longer, but still finite budget, then fall through to
        // the shared permanent-failure/DLQ path below.
        // Guard every failure-path write with `.eq('status', 'processing')`. If
        // the campaign was cancelled while this send was in flight (network
        // latency during the Meta call above), the cancel route already flipped
        // this row to 'cancelled'. Without this guard, the update below would
        // blindly overwrite that back to 'retrying'/'failed' — an "impossible"
        // transition (cancelled -> retrying) that would let a supposedly-
        // cancelled item get re-claimed by a future batch. (It would ultimately
        // be re-cancelled there by the per-item live-status check rather than
        // actually re-sent, but the row would incorrectly show as retrying/failed
        // in the meantime, and it'd cost an extra claim cycle.) A 0-row match
        // means the row is no longer ours to update — skip the DLQ/analytics
        // side effects too, since a cancelled message isn't a real failure.
        const isThrottled = err instanceof MetaApiError && (err.isRateLimited || err.isTierLimited);
        if (isThrottled) {
          const throttleAttempt = (item.attempt_count || 0) + 1;
          if (throttleAttempt <= MAX_THROTTLE_ATTEMPTS) {
            const deferMins = (err as MetaApiError).isTierLimited ? 60 : 5;
            const nextTime = new Date(Date.now() + deferMins * 60 * 1000);
            await supabaseAdmin
              .from('broadcast_queue')
              .update({ status: 'retrying', attempt_count: throttleAttempt, next_attempt_at: nextTime.toISOString(), failure_reason: `Meta throttled (${throttleAttempt}/${MAX_THROTTLE_ATTEMPTS}): ${errorMsg}`, locked_at: null })
              .eq('id', item.id)
              .eq('status', 'processing');
            processed++;
            continue;
          }
          // Throttle budget exhausted — fall through to permanent failure below.
        }

        const nextAttempt = (item.attempt_count || 0) + 1;

        if (!isThrottled && nextAttempt <= RETRY_BACKOFF_MINUTES.length) {
          const delayMins = RETRY_BACKOFF_MINUTES[nextAttempt - 1];
          const nextTime = new Date();
          nextTime.setMinutes(nextTime.getMinutes() + delayMins);

          await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'retrying',
              attempt_count: nextAttempt,
              next_attempt_at: nextTime.toISOString(),
              failure_reason: errorMsg,
              locked_at: null
            })
            .eq('id', item.id)
            .eq('status', 'processing');
        } else {
          // Permanent failure — mark failed AND record in the DLQ for recovery/audit.
          const { data: stillOurs } = await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'failed',
              attempt_count: nextAttempt,
              failure_reason: `Max attempts reached. Final error: ${errorMsg}`,
              processed_at: new Date().toISOString(),
              locked_at: null
            })
            .eq('id', item.id)
            .eq('status', 'processing')
            .select('id')
            .maybeSingle();

          if (!stillOurs) {
            // Row was cancelled (or otherwise reassigned) out from under us —
            // don't record a DLQ entry / failure analytics for a message that
            // isn't actually a failure.
            processed++;
            continue;
          }

          await pushToDLQ({
            tenant_id: tenantId,
            job_type: 'broadcast',
            campaign_id: item.campaign_id,
            payload: { queueItemId: item.id, phone: item.phone, contactId: item.contact_id, campaignId: item.campaign_id },
            error_message: errorMsg,
            retry_count: nextAttempt,
          }).catch(() => {});

          await supabaseAdmin.rpc('increment_broadcast_analytics', {
            target_campaign_id: item.campaign_id,
            col_name: 'failed_count'
          });
          await supabaseAdmin.rpc('increment_campaign_counter', {
            p_campaign_id: item.campaign_id,
            p_status: 'failed'
          });
        }
      }

      processed++;
    }

    // E. Check if queue is fully cleared for each campaign processed in this batch
    const campaignIdsInBatch = [...new Set(items.map(i => i.campaign_id))];
    for (const campaignId of campaignIdsInBatch) {
      const { count, error: countErr } = await supabaseAdmin
        .from('broadcast_queue')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['pending', 'retrying', 'processing']);

      if (!countErr && count === 0) {
        await supabaseAdmin
          .from('broadcast_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaignId);

        await ExecutionEventService.logEvent(
          tenantId,
          campaignId,
          'campaign_completed',
          'Campaign completed',
          'All enqueued messages processed successfully.',
          'success'
        );

        const { count: failedCount } = await supabaseAdmin
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('status', 'failed');
        const { count: totalCount } = await supabaseAdmin
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId);
        const total = totalCount ?? 0;
        const failed = failedCount ?? 0;
        if (total > 0 && failed / total > 0.2) {
          notifyAdmin({
            dedupeKey: `broadcast-high-fail-${campaignId}`,
            subject: `Broadcast completed with ${Math.round(failed / total * 100)}% failure rate`,
            summary: `Campaign ${campaignId} (tenant ${tenantId}) finished: ${failed}/${total} messages failed. Check Meta token validity and template approval status.`,
            context: { tenantId, campaignId, total, failed, failureRate: `${Math.round(failed / total * 100)}%` },
          }).catch(() => {});
        }
      }
    }

    return processed;
  }
}
