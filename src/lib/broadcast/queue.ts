// ═══════════════════════════════════════════════════════════
// Broadcast Queue — Direct processing (BullMQ in worker service)
// ═══════════════════════════════════════════════════════════
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { sendTemplateMessage } from '@/lib/gupshup/service';
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
      const apiKey = decryptToken(tenant.gupshup_api_key as string) as string;
      const variables = (personalizedComponents[0]?.parameters || [])
        .filter((p: { type: string; text?: string }) => p.type === 'text' && p.text)
        .map((p: { type: string; text?: string }) => p.text as string);
      await sendTemplateMessage(
        apiKey,
        tenant.gupshup_phone_number as string,
        lead.phone,
        templateName,
        variables,
        language,
        tenant.gupshup_app_name as string
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
