// ═══════════════════════════════════════════════════════════
// /api/cron/daily-report — nightly owner digest
// ═══════════════════════════════════════════════════════════
// The same report staff can pull any time by texting "report" to the bot
// (webhook route → dailyReport.ts), pushed once a night to the tenant's
// staff_phone and manager_phone. Opt-in per tenant: 'daily_report' in
// tenants.modules.
//
// WhatsApp only allows free-form text inside the recipient's 24h window. When
// it's open the full report goes out directly. When it's closed we send the
// approved shopify_daily_report_ready template (headline numbers + a
// "View Report" quick reply); the tap is an inbound "View Report" message that
// the webhook's report trigger answers with the full report.
//
// Idempotent per recipient per night: the nightly send is tagged in
// messages.metadata ({ nightly_report: '<date label>' }) and a second run for the
// same date skips that recipient (pass ?force=1 to override), so overlapping
// schedulers (pg_cron 22:00 + Vercel fallback) can't double-send. Only the
// nightly tag counts — an on-demand "report" earlier in the day must not
// suppress the nightly one (it did, with the old content-based check).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { getSessionState } from '@/lib/whatsapp/session';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';
import { notifyAdmin } from '@/lib/alerts/admin';
import { generateDailyReport, formatDailyReportMessage } from '@/lib/reports/dailyReport';
import { DAILY_REPORT_READY_TEMPLATE_NAME } from '@/lib/shopify/templates';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const TIME_BUDGET_MS = 45_000;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

interface Delivery { phone: string; mode: 'text' | 'template' | 'skipped_duplicate' | 'failed'; error?: string }

async function nightlyAlreadySent(tenantId: string, conversationId: string | null, dateLabel: string): Promise<boolean> {
  if (!conversationId) return false;
  const { count } = await supabaseAdmin.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('metadata->>nightly_report', dateLabel);
  return (count ?? 0) > 0;
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';
  const startedAt = Date.now();

  const { data: tenants, error } = await supabaseAdmin.from('tenants')
    .select('id, business_name, staff_phone, staff_name, manager_phone, wa_access_token, wa_phone_number_id, modules, is_active')
    .contains('modules', ['daily_report'])
    .eq('is_active', true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results: Array<{ tenantId: string; deliveries: Delivery[] }> = [];
  for (const tenant of tenants || []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const token = tenant.wa_access_token ? decryptTokenV2(tenant.wa_access_token as string) : null;
    if (!token || !tenant.wa_phone_number_id) continue;

    const businessName = (tenant.business_name as string) || 'Your Store';
    const data = await generateDailyReport(tenant.id as string);
    const reportText = formatDailyReportMessage(data, businessName);

    const staffPhone = normalizePhoneNumber(tenant.staff_phone as string | null);
    const recipients = Array.from(new Set([staffPhone, normalizePhoneNumber(tenant.manager_phone as string | null)].filter(Boolean)));
    const deliveries: Delivery[] = [];

    for (const phone of recipients) {
      const session = await getSessionState(tenant.id as string, phone);
      if (!force && await nightlyAlreadySent(tenant.id as string, session.conversationId, data.dateLabel)) {
        deliveries.push({ phone, mode: 'skipped_duplicate' });
        continue;
      }

      let content = reportText;
      let messageType: 'text' | 'template' = 'text';
      let wamid: string | null = null;
      let sendError: string | null = null;
      try {
        if (session.windowOpen) {
          wamid = (await sendTextMessage(token, tenant.wa_phone_number_id as string, phone, reportText)).messageId ?? null;
        } else {
          messageType = 'template';
          const firstName = phone === staffPhone && tenant.staff_name ? `${tenant.staff_name} Ji` : 'Ji';
          const revenue = `Rs ${(data.revenue ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
          content = `📊 DAILY REPORT ready (${data.dateLabel}) — Revenue ${revenue} from ${data.orders} orders. Sent as template; tap "View Report" for the full report.`;
          wamid = (await sendTemplateMessage(token, tenant.wa_phone_number_id as string, phone, DAILY_REPORT_READY_TEMPLATE_NAME, [
            { type: 'body', parameters: [firstName, businessName, data.dateLabel, revenue, String(data.orders)].map((text) => ({ type: 'text', text })) },
          ], 'en')).messageId ?? null;
        }
      } catch (err) {
        sendError = (err as Error).message;
      }

      if (session.conversationId) {
        await supabaseAdmin.from('messages').insert({
          tenant_id: tenant.id,
          conversation_id: session.conversationId,
          direction: 'outbound',
          content,
          message_type: messageType,
          channel: 'whatsapp',
          status: wamid ? 'sent' : 'failed',
          error_message: sendError ? sendError.slice(0, 500) : null,
          ai_generated: false,
          wa_message_id: wamid,
          // A failed send isn't tagged, so the fallback scheduler retries it.
          metadata: wamid ? { nightly_report: data.dateLabel } : null,
        });
      }

      if (sendError) {
        deliveries.push({ phone, mode: 'failed', error: sendError });
        await notifyAdmin({
          dedupeKey: `daily-report-failed:${tenant.id}:${phone}:${data.dateLabel}`,
          subject: 'Nightly daily report failed to send',
          summary: `${businessName}'s daily report to ${phone} failed (${messageType}): ${sendError}`,
          context: { tenant_id: tenant.id, phone, mode: messageType },
        }).catch(() => undefined);
      } else {
        deliveries.push({ phone, mode: messageType });
      }
    }
    results.push({ tenantId: tenant.id as string, deliveries });
  }

  return NextResponse.json({ ok: true, results, duration_ms: Date.now() - startedAt });
}

export const GET = handler;
export const POST = handler;
