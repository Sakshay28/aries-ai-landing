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

    if (appSecret && !verifySignature(rawBody, signature, appSecret)) {
      console.warn('[webhook] Meta signature validation failed.');
      return new Response('Forbidden', { status: 403 });
    }

    const payload = JSON.parse(rawBody);

    const entries = payload?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
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

          if (recipient) {
            // Update campaign aggregate counters (Try atomic RPC first, fallback if unavailable)
            try {
              const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_counter', {
                p_campaign_id: recipient.campaign_id,
                p_status: ourStatus,
              });

              if (rpcErr) {
                // Fallback 1: Call existing increment_broadcast_analytics RPC
                const metricColMap: Record<string, string> = {
                  sent: 'sent_count',
                  delivered: 'delivered_count',
                  read: 'read_count',
                  failed: 'failed_count'
                };
                const colToIncrement = metricColMap[ourStatus];
                if (colToIncrement) {
                  await supabaseAdmin.rpc('increment_broadcast_analytics', {
                    target_campaign_id: recipient.campaign_id,
                    col_name: colToIncrement
                  });

                  // Fallback 2: Increment column on campaign record directly
                  const { data: camp } = await supabaseAdmin
                    .from('broadcast_campaigns')
                    .select(colToIncrement)
                    .eq('id', recipient.campaign_id)
                    .single();
                  
                  if (camp) {
                    await supabaseAdmin
                      .from('broadcast_campaigns')
                      .update({
                        [colToIncrement]: ((camp as any)[colToIncrement] || 0) + 1,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', recipient.campaign_id);
                  }
                }
              }
            } catch (rpcEx) {
              console.error('[webhook] Counter increment exception:', rpcEx);
            }

            // Ingest audit log event
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
