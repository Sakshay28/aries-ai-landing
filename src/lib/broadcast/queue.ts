// ═══════════════════════════════════════════════════════════
// Broadcast Queue — Direct processing (BullMQ in worker service)
// ═══════════════════════════════════════════════════════════
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { sendTemplateMessage } from '@/lib/whatsapp/service';
import { sleep } from '@/lib/utils/safety';
import * as Sentry from '@sentry/nextjs';

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
      await sendTemplateMessage(tenant, lead.phone, templateName, language, personalizedComponents);
      sent++;
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
