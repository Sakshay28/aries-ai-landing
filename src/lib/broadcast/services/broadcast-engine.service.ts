import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { AudienceEngineService } from './audience-engine.service';
import { MetaPayloadBuilderService } from './meta-payload-builder.service';
import { TemplateParserService } from './template-parser.service';
import { sleep } from '@/lib/utils/safety';
import { ExecutionEventService } from './execution-event.service';
import { notifyAdmin } from '@/lib/alerts/admin';

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 30, 60];

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

      // Guard against re-launch: only draft/scheduled/launching campaigns can be queued.
      // 'launching' is set by the scheduler's CAS claim to prevent double-dispatch.
      if (!['draft', 'scheduled', 'launching'].includes(campaign.status)) {
        return { success: false, error: `Campaign is already "${campaign.status}". Cannot re-launch — duplicate sends prevented.` };
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

      // Create default analytics record
      await supabaseAdmin
        .from('broadcast_analytics')
        .upsert({
          campaign_id: campaignId,
          tenant_id: tenantId,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          failed_count: 0
        });

      return { success: true, queuedCount: resolved.total };

    } catch (e) {
      console.error('❌ Launch Campaign Engine failed:', e);
      return { success: false, error: (e as Error).message || 'Failed to start campaign dispatch' };
    }
  }

  /**
   * Core dispatcher loop. Processes enqueued pending/retrying messages,
   * enforces throttling rate limits, exponential backoffs, quiet hours, and updates statuses.
   */
  static async processQueue(limit = 100, forceNow = false): Promise<number> {
    let processed = 0;
    try {
      // 0. Unlock items stuck in 'processing' for more than 10 minutes (crashed runs)
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from('broadcast_queue')
        .update({ status: 'pending', locked_at: null })
        .eq('status', 'processing')
        .lt('locked_at', staleThreshold);

      // 0b. forceNow: reset next_attempt_at on deferred pending items so they're picked up immediately
      if (forceNow) {
        await supabaseAdmin
          .from('broadcast_queue')
          .update({ next_attempt_at: null })
          .eq('status', 'pending')
          .is('locked_at', null)
          .gt('next_attempt_at', new Date().toISOString());
      }

      // 1. Atomically fetch and lock items using FOR UPDATE SKIP LOCKED.
      //    This eliminates the race window between SELECT and UPDATE that caused
      //    duplicate sends when two cron invocations overlapped.
      //    Requires the lock_broadcast_queue_batch() RPC from migrations/broadcast_production_hardening.sql.
      let queueItems: any[] | null = null;
      const { data: atomicItems, error: lockErr } = await supabaseAdmin
        .rpc('lock_broadcast_queue_batch', { batch_limit: limit });

      if (!lockErr) {
        queueItems = atomicItems;
      } else {
        // Fallback to two-step SELECT → UPDATE while RPC migration is pending
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
          queueItems = fallbackItems;
        }
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[QUEUE_JOB] No pending items found in broadcast_queue');
        return 0;
      }

      console.log(`[QUEUE_JOB] Processing ${queueItems.length} queue items`);

      // 3. Group by tenant to process credentials and handle quiet hours efficiently
      const tenantGroupMap = new Map<string, any[]>();
      queueItems.forEach(item => {
        const list = tenantGroupMap.get(item.tenant_id) || [];
        list.push(item);
        tenantGroupMap.set(item.tenant_id, list);
      });

      for (const [tenantId, items] of tenantGroupMap.entries()) {
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
          continue;
        }

        const accessToken = decryptToken(tenant.wa_access_token) as string;

        // B. Pre-fetch opt-out list for just-in-time filtering at send time.
        //    Contacts may opt out between audience resolution and message dispatch.
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

        // Step 1: fetch all campaigns + delivery settings in parallel
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

        // Step 2: fetch variable mappings + template cache in parallel (now we know template names)
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
              processed++;
              continue;
            }

            // Quiet hours enforcement: skip sends between 9 PM and 9 AM in campaign timezone
            const dSettings = deliverySettingsCache.get(item.campaign_id);
            if (dSettings?.quiet_hours) {
              const tz = dSettings.timezone || 'Asia/Kolkata';
              const localHour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
              const h = parseInt(localHour, 10);
              if (h >= 21 || h < 9) {
                // Re-queue for later — don't cancel, just defer
                await supabaseAdmin
                  .from('broadcast_queue')
                  .update({ status: 'pending', locked_at: null })
                  .eq('id', item.id);
                processed++;
                continue;
              }
            }

            // Check if campaign was cancelled/paused mid-send.
            // Re-fetch live status once per campaign (not per item) to detect cancel API calls.
            if (!campaignLiveStatusCache.has(item.campaign_id)) {
              const { data: liveRow } = await supabaseAdmin
                .from('broadcast_campaigns')
                .select('status, updated_at, auto_resumed')
                .eq('id', item.campaign_id)
                .single();
              const st = liveRow?.status || 'unknown';

              // Auto-resume: if paused >30 min ago and never auto-resumed before,
              // give it one more chance (handles temporary Meta outages).
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

            // Just-in-time opt-out check — contact may have opted out after audience resolution
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
              name: item.payload?.name || 'there',
              phone: item.phone
            };

            const metaComponents = MetaPayloadBuilderService.buildPayload(
              variablesMap,
              detectedVarIndices,
              leadRecord
            );

            const languageCode = item.language_code || campaign.template_language || 'en';

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
              // Mark queue item as sent
              await supabaseAdmin
                .from('broadcast_queue')
                .update({
                  status: 'sent',
                  processed_at: new Date().toISOString(),
                  locked_at: null
                })
                .eq('id', item.id);

              // Ingest in broadcast_deliveries — source of truth for per-message status.
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

              // Increment sent_count HERE — the webhook 'sent' status won't trigger
              // a change (delivery already 'sent'), so it would never be counted otherwise.
              await supabaseAdmin.rpc('increment_campaign_counter', {
                p_campaign_id: item.campaign_id,
                p_status: 'sent',
              });

              // Record send for per-contact frequency cap
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

            const nextAttempt = (item.attempt_count || 0) + 1;
            
            if (nextAttempt <= RETRY_BACKOFF_MINUTES.length) {
              // Backoff delay
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
                .eq('id', item.id);
            } else {
              // Permanent failure limit exceeded
              await supabaseAdmin
                .from('broadcast_queue')
                .update({
                  status: 'failed',
                  attempt_count: nextAttempt,
                  failure_reason: `Max attempts reached. Final error: ${errorMsg}`,
                  processed_at: new Date().toISOString(),
                  locked_at: null
                })
                .eq('id', item.id);

              // Increment failed analytics
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
          
          // No artificial sleep needed — Meta allows 80 msg/sec; our DB latency is the natural throttle
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
      }

    } catch (e) {
      console.error('❌ Background cron processQueue failed:', e);
    }
    return processed;
  }
}
