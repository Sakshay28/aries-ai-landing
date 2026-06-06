import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifySignature } from '@/lib/meta/service';

// GET Handler for Meta Webhook Verification Handshake
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[webhook] Meta webhook subscription verified successfully.');
    return new Response(challenge, { status: 200 });
  }

  console.warn(`[webhook] Meta webhook verification challenge failed. Expected token matching: ${verifyToken ? 'Yes' : 'No'}`);
  return new Response('Forbidden', { status: 403 });
}

// POST Handler to ingest status updates
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const appSecret = process.env.WHATSAPP_WEBHOOK_SECRET || process.env.META_APP_SECRET;

    if (!appSecret) {
      console.error('[webhook] WHATSAPP_WEBHOOK_SECRET not configured — rejecting unverified webhook');
      return new Response('Forbidden', { status: 403 });
    }
    if (!verifySignature(rawBody, signature, appSecret)) {
      console.warn('[webhook] Meta signature validation failed — possible spoofed delivery status.');
      return new Response('Forbidden', { status: 403 });
    }

    const payload = JSON.parse(rawBody);

    const entries = payload?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        // Track inbound replies to link them back to the originating broadcast campaign
        const inboundMessages = change.value?.messages || [];
        for (const msg of inboundMessages) {
          if (!msg.from || !msg.id) continue;
          // Look up if this sender has a recent broadcast delivery from this tenant
          const { data: delivery } = await supabaseAdmin
            .from('broadcast_deliveries')
            .select('campaign_id, tenant_id')
            .eq('phone', msg.from)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (delivery) {
            try {
              await supabaseAdmin.rpc('increment_broadcast_analytics', {
                target_campaign_id: delivery.campaign_id,
                col_name: 'reply_count'
              });
            } catch { /* non-critical */ }
          }
        }

        const statuses = change.value?.statuses || [];
        for (const status of statuses) {
          const { id: waMessageId, status: waStatus, timestamp } = status;

          const statusMap: Record<string, string> = {
            sent: 'sent',
            delivered: 'delivered',
            read: 'read',
            failed: 'failed',
          };

          const ourStatus = statusMap[waStatus];
          if (!ourStatus) continue;

          const updateFields: Record<string, any> = {
            status: ourStatus,
          };

          const statusTime = new Date(parseInt(timestamp) * 1000).toISOString();
          if (waStatus === 'delivered') updateFields.delivered_at = statusTime;
          if (waStatus === 'read')      updateFields.read_at = statusTime;
          if (waStatus === 'failed') {
            updateFields.failed_reason = status.errors?.[0]?.title || 'Failed';
          }

          // Fetch existing status BEFORE update for idempotency check.
          // Meta delivers webhooks at-least-once — the same event can arrive multiple times.
          // We only increment analytics counters if the status actually changes.
          const { data: existing } = await supabaseAdmin
            .from('broadcast_deliveries')
            .select('status, campaign_id, tenant_id')
            .eq('message_id', waMessageId)
            .maybeSingle();

          const statusActuallyChanged = existing && existing.status !== ourStatus;

          // Update individual delivery status
          const { data: recipient, error: updateErr } = await supabaseAdmin
            .from('broadcast_deliveries')
            .update(updateFields)
            .eq('message_id', waMessageId)
            .select('campaign_id, tenant_id')
            .maybeSingle();

          if (updateErr) {
            console.error(`[webhook] Failed to update delivery message_id="${waMessageId}":`, updateErr.message);
            continue;
          }

          if (recipient && statusActuallyChanged) {
            // Increment analytics ONLY when status changed — prevents double-count from webhook retries
            try {
              await supabaseAdmin.rpc('increment_campaign_counter', {
                p_campaign_id: recipient.campaign_id,
                p_status: ourStatus,
              });
            } catch (rpcEx) {
              console.error('[webhook] Counter increment exception:', rpcEx);
            }

            await supabaseAdmin.from('broadcast_events').insert({
              campaign_id: recipient.campaign_id,
              tenant_id: recipient.tenant_id,
              event_type: `message_${ourStatus}`,
              payload: { waMessageId, waStatus, timestamp },
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[webhook] Ingestion error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Ingestion Error' }, { status: 500 });
  }
}
