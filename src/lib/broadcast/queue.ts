// ═══════════════════════════════════════════════════════════
// Broadcast Queue — Direct processing (BullMQ in worker service)
// ═══════════════════════════════════════════════════════════
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { sleep } from '@/lib/utils/safety';
import * as Sentry from '@/lib/sentry-stub';
import { getRedisClient } from '@/lib/redis/client';

interface TemplateComponent {
  type: string;
  parameters?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface BroadcastJobData {
  tenantId: string;
  templateName: string;
  language: string;
  broadcastId: string;
  leads: { id: string; name: string; phone: string }[];
  components: TemplateComponent[];
}

export function initBroadcastEngine() {
  // No-op on Vercel — worker handles queues
}

export async function enqueueBroadcast(data: BroadcastJobData): Promise<void> {
  // Process directly on Vercel (no Redis/BullMQ)
  processBroadcastJob(data).catch((err) => {
    console.error('❌ Broadcast failed:', err);
    Sentry.captureException(err);
  });
}

async function processBroadcastJob(data: BroadcastJobData) {
  const { tenantId, templateName, language, broadcastId, leads, components } = data;
  const tenant = await getTenantById(tenantId);
  
  if (!tenant) throw new Error('Tenant not found');

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const lead of leads) {
    if (!lead.phone) continue;

    const personalizedComponents = components.length > 0
      ? components
      : [
          {
            type: 'body',
            parameters: [{ type: 'text', text: lead.name || 'there' }],
          },
        ];

    try {
      const apiKey = decryptToken(tenant.wa_access_token as string) as string;
      await sendTemplateMessage(
        apiKey,
        tenant.wa_phone_number_id as string,
        lead.phone,
        templateName,
        personalizedComponents,
        language
      );
      sent++;
      // Tag phone → campaign in Redis so inbound replies can be counted (7-day TTL)
      try {
        const redis = getRedisClient();
        if (redis) {
          await redis.set(
            `broadcast:phone:${tenantId}:${lead.phone.replace(/\D/g, '')}`,
            broadcastId,
            'EX',
            86400 * 7
          );
        }
      } catch { /* non-critical */ }
    } catch (error: unknown) {
      failed++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${lead.phone}: ${message}`);
    }

    // Per-message delay to stay under Meta's 80 msgs/sec limit
    // 50ms = ~20 msg/sec — well under Meta's 80/sec with safety margin
    await sleep(50);
  }

  // Log completion
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenantId,
    event_type: 'broadcast_completed',
    channel: 'whatsapp',
    metadata: {
      broadcast_id: broadcastId,
      template_name: templateName,
      sent,
      failed,
      total: leads.length,
      errors: errors.slice(0, 10),
    },
  });

  console.log(`📢 [${tenant.business_name}] Broadcast completed: ${sent} sent, ${failed} failed`);
}

export async function shutdownBroadcastEngine() {
  // No-op on Vercel
}

const BATCH_DELAY_MS = 200;  // 5 msg/s — safe for all plans
const MAX_RECIPIENTS = 500;  // guard against Vercel 5-min timeout

export async function processCampaign(
  tenantId: string,
  campaignId: string,
  campaign: Record<string, unknown>,
  tenant: Record<string, unknown>
) {
  try {
    const decryptedApiKey = decryptToken(tenant.wa_access_token as string) as string;

    const nameVal = campaign.name as string;
    let leads: { id: string; phone: string }[] = [];
    let fetchError = null;

    if (nameVal && nameVal.startsWith('__retarget:')) {
      const endIdx = nameVal.indexOf('__:');
      if (endIdx !== -1) {
        const parentCampaignId = nameVal.slice(11, endIdx);
        
        // Fetch all messages for the parent campaign to determine non-readers
        const { data: parentMsgs, error: parentMsgsErr } = await supabaseAdmin
          .from('broadcast_messages')
          .select('lead_id, status')
          .eq('campaign_id', parentCampaignId);

        if (parentMsgsErr) {
          console.error('Error fetching parent campaign messages:', parentMsgsErr);
          throw parentMsgsErr;
        }

        // Gather lead IDs that read the parent campaign
        const readLeadIds = new Set(
          (parentMsgs || [])
            .filter(m => m.status === 'read')
            .map(m => m.lead_id)
        );

        // Gather lead IDs that were sent the parent campaign but did not read it
        const targetLeadIds = Array.from(
          new Set(
            (parentMsgs || [])
              .filter(m => m.lead_id && !readLeadIds.has(m.lead_id))
              .map(m => m.lead_id)
          )
        );

        if (targetLeadIds.length > 0) {
          const { data, error } = await supabaseAdmin
            .from('leads')
            .select('id, phone')
            .eq('tenant_id', tenantId)
            .in('id', targetLeadIds)
            .not('phone', 'is', null)
            .limit(MAX_RECIPIENTS);
          leads = (data || []) as { id: string; phone: string }[];
          fetchError = error;
        } else {
          leads = [];
        }
      } else {
        // Fallback if naming convention was malformed
        const { data, error } = await supabaseAdmin
          .from('leads')
          .select('id, phone')
          .eq('tenant_id', tenantId)
          .not('phone', 'is', null)
          .limit(MAX_RECIPIENTS);
        leads = (data || []) as { id: string; phone: string }[];
        fetchError = error;
      }
    } else {
      // Normal campaign: fetch all contacts
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('id, phone')
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null)
        .limit(MAX_RECIPIENTS);
      leads = (data || []) as { id: string; phone: string }[];
      fetchError = error;
    }

    if (fetchError) {
      throw fetchError;
    }

    if (leads.length === 0) {
      // Complete campaign immediately since no recipients are targeted
      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ status: 'completed', sent_count: 0, failed_count: 0 })
        .eq('id', campaignId);
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        const result = await sendTemplateMessage(
          decryptedApiKey,
          tenant.wa_phone_number_id as string,
          lead.phone,
          campaign.template_name as string,
          [],
          'en'
        );

        sent++;
        await supabaseAdmin.from('broadcast_messages').insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          lead_id: lead.id,
          recipient_phone: lead.phone,
          wa_message_id: result.messageId,
          status: 'sent',
        });
      } catch (e) {
        failed++;
        console.error(`Broadcast: failed to send to ${lead.phone}:`, (e as Error).message);
      }

      // 200 ms between sends = 5 msg/s (safe for all plans)
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'completed', sent_count: sent, failed_count: failed })
      .eq('id', campaignId);

  } catch (error) {
    console.error('Broadcast: campaign processing failed:', error);
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'failed' })
      .eq('id', campaignId);
  }
}
