import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { AudienceEngineService } from './audience-engine.service';
import { MetaPayloadBuilderService } from './meta-payload-builder.service';
import { TemplateParserService } from './template-parser.service';
import { sleep } from '@/lib/utils/safety';
import { ExecutionEventService } from './execution-event.service';

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 30, 60];

export class BroadcastEngineService {
  /**
   * Resolves the target audience cohort, E.164 formats them, filters opt-outs, 
   * and populates the database queue table in pending state.
   */
  static async launchCampaign(tenantId: string, campaignId: string): Promise<{ success: boolean; queuedCount?: number; error?: string }> {
    try {
      // 1. Fetch Campaign Core & configuration details
      const { data: campaign } = await supabaseAdmin
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (!campaign) {
        return { success: false, error: 'Campaign not found' };
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
      const queueEntries = resolved.contacts.map(contact => ({
        tenant_id:       tenantId,
        campaign_id:     campaignId,
        contact_id:      contact.id,
        phone:           contact.phone,
        status:          'pending',
        attempt_count:   0,
        next_attempt_at: now,
        language_code:   templateLanguage,
        payload: {
          name: contact.name,
        },
      }));

      // Ingest in chunks of 500 to keep within postgres parameters limits
      const chunkSize = 500;
      for (let i = 0; i < queueEntries.length; i += chunkSize) {
        const chunk = queueEntries.slice(i, i + chunkSize);
        const { error: insertErr } = await supabaseAdmin
          .from('broadcast_queue')
          .insert(chunk);
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
  static async processQueue(limit = 100): Promise<number> {
    let processed = 0;
    try {
      // 1. Fetch pending tasks that are scheduled to be executed now or in the past
      //    Use .or() to also pick up items with null next_attempt_at (legacy rows)
      const nowIso = new Date().toISOString();
      const { data: queueItems } = await supabaseAdmin
        .from('broadcast_queue')
        .select('*')
        .in('status', ['pending', 'retrying'])
        .is('locked_at', null)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (!queueItems || queueItems.length === 0) {
        console.log('[QUEUE_JOB] No pending items found in broadcast_queue');
        return 0;
      }

      console.log(`[QUEUE_JOB] Processing ${queueItems.length} queue items`);

      // 2. Lock items in transaction/batch to prevent duplicate cron processors firing
      const ids = queueItems.map(item => item.id);
      await supabaseAdmin
        .from('broadcast_queue')
        .update({ locked_at: new Date().toISOString(), status: 'processing' })
        .in('id', ids);

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
          // Permanently fail all queue items for this tenant
          await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'failed',
              failure_reason: 'Meta credentials not active or missing',
              processed_at: new Date().toISOString(),
              locked_at: null
            })
            .in('id', items.map(i => i.id));
          continue;
        }

        // B. Enforce Quiet hours protection (9 PM to 8 AM local time)
        const timezone = tenant.timezone || 'Asia/Kolkata';
        const localTime = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
        const hour = localTime.getHours();

        if (hour >= 21 || hour < 8) {
          // Defer enqueued messages to 8:15 AM local time tomorrow
          const tomorrow = new Date(localTime);
          tomorrow.setDate(tomorrow.getDate() + (hour >= 21 ? 1 : 0));
          tomorrow.setHours(8, 15, 0, 0);
          
          await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'pending',
              next_attempt_at: tomorrow.toISOString(),
              locked_at: null
            })
            .in('id', items.map(i => i.id));
          continue;
        }

        const accessToken = decryptToken(tenant.wa_access_token) as string;

        // C. Process enqueued messages
        for (const item of items) {
          try {
            // Fetch campaign configuration details
            const { data: campaign } = await supabaseAdmin
              .from('broadcast_campaigns')
              .select('*')
              .eq('id', item.campaign_id)
              .single();

            const { data: variableMappings } = await supabaseAdmin
              .from('broadcast_variable_mapping')
              .select('*')
              .eq('campaign_id', item.campaign_id);

            if (!campaign) {
              await supabaseAdmin
                .from('broadcast_queue')
                .update({ status: 'failed', failure_reason: 'Campaign configuration missing', locked_at: null })
                .eq('id', item.id);
              continue;
            }

            // Map variables schema into payload builders
            const variablesMap: Record<string, any> = {};
            (variableMappings || []).forEach(v => {
              variablesMap[v.variable_key] = {
                index: v.variable_key,
                sourceType: v.source_type,
                crmField: v.crm_field,
                staticValue: v.custom_value
              };
            });

            const bodyText = campaign.template_name || '';
            const matches = [...bodyText.matchAll(/{{(\d+)}}/g)];
            const detectedVarIndices = [...new Set(matches.map(m => m[1]))].sort();

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

            // Resolve language: use queue item's language_code, campaign's template_language,
            // or fall back to 'en'. This fixes silent 400s for non-English templates.
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

              // Ingest in broadcast_deliveries
              await supabaseAdmin
                .from('broadcast_deliveries')
                .insert({
                  tenant_id: tenantId,
                  campaign_id: item.campaign_id,
                  contact_id: item.contact_id,
                  phone: item.phone,
                  message_id: waResult.messageId,
                  status: 'sent'
                });

              // Increment analytics table
              await supabaseAdmin.rpc('increment_broadcast_analytics', {
                target_campaign_id: item.campaign_id,
                col_name: 'sent_count'
              });

              // Increment campaign row counters (this is what the stats page reads)
              await supabaseAdmin.rpc('increment_campaign_counter', {
                p_campaign_id: item.campaign_id,
                p_status: 'sent'
              });
            } else {
              throw new Error('Missing outbound messageId');
            }

          } catch (err) {
            const errorMsg = (err as Error).message || 'Unknown network error';
            console.error(`❌ Meta dispatch failure to ${item.phone}:`, errorMsg);

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
          
          // Throttling safety pause: ~200ms per message (5 msgs/sec limit pacing)
          await sleep(200);
        }

        // D. Check if queue is fully cleared for each campaign processed in this batch
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
          }
        }
      }

    } catch (e) {
      console.error('❌ Background cron processQueue failed:', e);
    }
    return processed;
  }
}
