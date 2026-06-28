// ═══════════════════════════════════════════════════════════
// /api/cron/session-keepalive  — runs every 30 minutes
// ═══════════════════════════════════════════════════════════
// Two jobs run in parallel every 30 minutes:
//
// [A] Customer keepalive — finds active staff-handled conversations where
//     the customer's last inbound message was 22–23.5h ago. The 24h window
//     is still open, so a free-form nudge is sent to prompt a reply.
//     Customer replies → window resets → staff can always message freely.
//     Each tenant opts in via an Automation rule (trigger = 'session_window_expiring').
//
// [B] Staff phone keepalive — sends a brief daily ping to the owner's
//     staff_phone and manager_phone. This keeps the business→staff WhatsApp
//     window permanently open so booking alerts and cancellation alerts
//     are NEVER blocked by Meta error 131047.
//     Dedup: uses system_heartbeats table (key = staff_keepalive:{tenant_id}).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { isWindowClosedError } from '@/lib/automations/logic';
import { notifyAdmin } from '@/lib/alerts/admin';

const WINDOW_OPEN_HOURS  = 22;    // nudge customer at 22h — window still open
const WINDOW_CLOSE_HOURS = 23.5;  // stop after 23.5h — too late, window closed
const DEDUP_MINUTES      = 90;    // skip customer conv if outbound sent in last 90 min
const STAFF_PING_HOURS   = 22;    // ping staff phones every 22h

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const windowOpenAt  = new Date(now.getTime() - WINDOW_OPEN_HOURS  * 3_600_000).toISOString();
  const windowCloseAt = new Date(now.getTime() - WINDOW_CLOSE_HOURS * 3_600_000).toISOString();
  const dedupCutoff   = new Date(now.getTime() - DEDUP_MINUTES * 60_000).toISOString();

  const [customerResult, staffResult] = await Promise.allSettled([
    runCustomerKeepalive(windowOpenAt, windowCloseAt, dedupCutoff),
    runStaffKeepalive(),
  ]);

  return NextResponse.json({
    customer: customerResult.status === 'fulfilled' ? customerResult.value : { sent: 0, skipped: 0, error: (customerResult.reason as Error)?.message },
    staff:    staffResult.status    === 'fulfilled' ? staffResult.value    : { pinged: 0, error: (staffResult.reason as Error)?.message },
    checkedAt: now.toISOString(),
  });
}

// ── [B] Staff phone keepalive ─────────────────────────────────────────────────
async function runStaffKeepalive(): Promise<{ pinged: number; skipped: number }> {
  const cutoff = new Date(Date.now() - STAFF_PING_HOURS * 3_600_000).toISOString();

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, wa_access_token, wa_phone_number_id, business_name, staff_phone, manager_phone')
    .or('staff_phone.not.is.null,manager_phone.not.is.null');

  let pinged = 0;
  let skipped = 0;

  for (const tenant of tenants ?? []) {
    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) { skipped++; continue; }
    const token = decryptToken(tenant.wa_access_token);
    if (!token) { skipped++; continue; }

    const phones = [...new Set(
      [tenant.staff_phone, tenant.manager_phone]
        .filter(Boolean)
        .map((p: string) => p.replace(/\D/g, ''))
        .map((p: string) => p.length === 10 ? '91' + p : p)
        .filter((p: string) => p.length >= 10),
    )] as string[];

    if (!phones.length) { skipped++; continue; }

    // Dedup via system_heartbeats — avoids inserting fake message rows.
    // Key: staff_keepalive:{tenant_id}  last_run_at = when we last pinged.
    const heartbeatKey = `staff_keepalive:${tenant.id}`;
    const { data: hb } = await supabaseAdmin
      .from('system_heartbeats')
      .select('last_run_at')
      .eq('key', heartbeatKey)
      .maybeSingle();

    if (hb?.last_run_at && hb.last_run_at > cutoff) {
      // Already pinged this tenant's staff within the last 22h — skip
      skipped++;
      continue;
    }

    const pingText =
      `📋 *Daily update — ${tenant.business_name || 'Your Restaurant'}*\n` +
      `All good! You'll receive booking confirmations and cancellation alerts here instantly.\n` +
      `_Dashboard: https://ariesai.in/dashboard_`;

    let sentAny = false;
    for (const phone of phones) {
      try {
        await sendTextMessage(token, tenant.wa_phone_number_id, phone, pingText);
        pinged++;
        sentAny = true;
        console.log(`[staff-keepalive] ✅ pinged +${phone} (${tenant.business_name})`);
      } catch (err) {
        if (isWindowClosedError(err)) {
          // Window closed between business number and this staff phone.
          // This happens on first setup or if staff never messaged back.
          // Log clearly so the owner knows they need to send one message first.
          console.warn(
            `[staff-keepalive] ⚠️  window closed for staff phone +${phone} (${tenant.business_name}). ` +
            `Staff must send one WhatsApp message to the business number to open the window.`
          );
        } else {
          console.error(`[staff-keepalive] ❌ failed for +${phone} (${tenant.business_name}):`, (err as Error).message);
        }
      }
    }

    // Update heartbeat whether we sent or not — avoids hammering a phone that
    // has no window (we'll log the warning once per 22h, not every 30 min).
    if (sentAny) {
      await supabaseAdmin
        .from('system_heartbeats')
        .upsert({ key: heartbeatKey, last_run_at: new Date().toISOString() }, { onConflict: 'key' })
        .then(null, (e) => console.error('[staff-keepalive] heartbeat upsert failed:', e.message));
    }
  }

  return { pinged, skipped };
}

// ── [A] Customer keepalive ────────────────────────────────────────────────────
async function runCustomerKeepalive(
  windowOpenAt: string,
  windowCloseAt: string,
  dedupCutoff: string,
): Promise<{ sent: number; skipped: number }> {
  const { data: atRisk, error: findErr } = await supabaseAdmin.rpc(
    'find_session_expiring_conversations',
    { window_open_at: windowOpenAt, window_close_at: windowCloseAt, dedup_cutoff: dedupCutoff }
  );

  if (findErr) {
    console.warn('[session-keepalive] RPC not found, using fallback query:', findErr.message);
    return fallbackQuery(windowOpenAt, windowCloseAt, dedupCutoff);
  }

  return processConversations(atRisk ?? []);
}

// ── Fallback query (no RPC yet) ───────────────────────────────────────────────
async function fallbackQuery(
  windowOpenAt: string,
  windowCloseAt: string,
  dedupCutoff: string,
): Promise<{ sent: number; skipped: number }> {
  const { data: convRows } = await supabaseAdmin
    .from('messages')
    .select('conversation_id, tenant_id, created_at')
    .eq('direction', 'inbound')
    .gte('created_at', windowCloseAt)
    .lte('created_at', windowOpenAt)
    .order('created_at', { ascending: false });

  if (!convRows?.length) return { sent: 0, skipped: 0 };

  // One row per conversation — keep the most recent inbound
  const latestByConv = new Map<string, typeof convRows[0]>();
  for (const row of convRows) {
    if (!latestByConv.has(row.conversation_id)) latestByConv.set(row.conversation_id, row);
  }

  const convIds = Array.from(latestByConv.keys());

  // Skip conversations that already received an outbound in the dedup window
  const { data: recentOutbound } = await supabaseAdmin
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', convIds)
    .eq('direction', 'outbound')
    .gte('created_at', dedupCutoff);

  const alreadySent = new Set((recentOutbound ?? []).map(m => m.conversation_id));

  // Only conversations where staff is actively handling (bot paused or escalated)
  const { data: activeConvs } = await supabaseAdmin
    .from('conversations')
    .select('id, tenant_id, sender_id, leads(phone, name), bot_paused, escalated')
    .in('id', convIds)
    .eq('is_active', true)
    .or('bot_paused.eq.true,escalated.eq.true');

  const eligible = (activeConvs ?? []).filter(c => !alreadySent.has(c.id));

  return processConversations(eligible.map(c => {
    const leads = c.leads as unknown as { phone: string | null; name: string | null } | { phone: string | null; name: string | null }[] | null;
    const lead  = Array.isArray(leads) ? leads[0] : leads;
    return {
      conversation_id: c.id,
      tenant_id: c.tenant_id,
      sender_id: c.sender_id,
      phone: lead?.phone ?? c.sender_id,
      lead_name: lead?.name ?? null,
    };
  }));
}

// ── Core send loop ────────────────────────────────────────────────────────────
async function processConversations(rows: Array<{
  conversation_id: string;
  tenant_id: string;
  sender_id?: string | null;
  phone?: string | null;
  lead_name?: string | null;
}>): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  // Group by tenant — one credential fetch covers all their conversations
  const byTenant = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, []);
    byTenant.get(row.tenant_id)!.push(row);
  }

  for (const [tenantId, convs] of byTenant) {
    const [tenantRes, autoRes] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id, business_name')
        .eq('id', tenantId)
        .single(),
      supabaseAdmin
        .from('automations')
        .select('message_text, fallback_template_name')
        .eq('tenant_id', tenantId)
        .eq('trigger_event', 'session_window_expiring')
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle(),
    ]);

    const tenant     = tenantRes.data;
    const automation = autoRes.data;

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) { skipped += convs.length; continue; }
    if (!automation?.message_text) { skipped += convs.length; continue; }

    const token = decryptToken(tenant.wa_access_token);
    if (!token) { skipped += convs.length; continue; }

    for (const conv of convs) {
      const phone = conv.phone;
      if (!phone) { skipped++; continue; }

      const firstName = (conv.lead_name || '').split(' ')[0] || 'there';
      const vars: Record<string, string> = {
        customer_name: conv.lead_name || firstName,
        first_name:    firstName,
        business_name: tenant.business_name || '',
      };
      const rendered = automation.message_text.replace(
        /\{\{(\w+)\}\}/g,
        (_: string, key: string) => vars[key] ?? `{{${key}}}`,
      );

      try {
        const result = await sendTextMessage(token, tenant.wa_phone_number_id, phone, rendered);
        await supabaseAdmin.from('messages').insert({
          tenant_id:       tenantId,
          conversation_id: conv.conversation_id,
          direction:       'outbound',
          content:         rendered,
          message_type:    'text',
          channel:         'whatsapp',
          status:          'sent',
          ai_generated:    true,
          wa_message_id:   result.messageId ?? null,
        });
        console.log(`[session-keepalive] ✅ sent conv=${conv.conversation_id}`);
        sent++;
      } catch (sendErr) {
        if (isWindowClosedError(sendErr)) {
          if (automation.fallback_template_name) {
            try {
              const tplResult = await sendTemplateMessage(
                token, tenant.wa_phone_number_id, phone,
                automation.fallback_template_name, [firstName], 'en',
              );
              await supabaseAdmin.from('messages').insert({
                tenant_id:       tenantId,
                conversation_id: conv.conversation_id,
                direction:       'outbound',
                content:         `[Template: ${automation.fallback_template_name}]`,
                message_type:    'template',
                channel:         'whatsapp',
                status:          'sent',
                ai_generated:    true,
                wa_message_id:   tplResult.messageId ?? null,
                metadata:        { interactive_type: 'template', template_name: automation.fallback_template_name },
              });
              sent++;
            } catch {
              skipped++;
            }
          } else {
            await notifyAdmin({
              dedupeKey: `keepalive_window_closed:${tenantId}`,
              subject:   'Session keepalive blocked — 24h window already closed',
              summary:   `Keepalive for ${tenant.business_name} couldn't reach a customer. Set a fallback_template_name on the automation.`,
              context:   { tenant_id: tenantId, conversation_id: conv.conversation_id },
            }).catch(() => {});
            skipped++;
          }
        } else {
          console.error(`[session-keepalive] ❌ conv=${conv.conversation_id}:`, (sendErr as Error).message);
          skipped++;
        }
      }
    }
  }

  return { sent, skipped };
}
