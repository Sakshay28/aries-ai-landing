// ═══════════════════════════════════════════════════════════
// 🚨 Escalation Cron Route — /api/cron/escalation
// ═══════════════════════════════════════════════════════════
// Periodically checks for unacknowledged critical business alerts
// and escalates through the hierarchy (Staff -> Manager -> Owner -> Admins)
// if staff/managers fail to confirm receipt within SLA thresholds.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTextMessage, sendInteractiveButtonsMessage } from '@/lib/meta/service';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';
import { notifyAdmin } from '@/lib/alerts/admin';
import { notifyTenant } from '@/lib/alerts/tenantAlert';

export const maxDuration = 60; // Allow enough time for meta API dispatches

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  let escalatedCount = 0;
  let exhaustedCount = 0;

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // 1. Fetch unacknowledged alerts that need Manager Escalation (Stage 1: > 5 mins, stage = null / pending)
    const { data: managerEscalations } = await supabaseAdmin
      .from('business_notifications')
      .select('id, tenant_id, title, body, created_at, escalation_stage')
      .is('acknowledged_at', null)
      .or('escalation_stage.is.null, escalation_stage.eq.pending, escalation_stage.eq.delivered')
      .lt('created_at', fiveMinutesAgo)
      .limit(10); // rate-limited batch ticks

    if (managerEscalations && managerEscalations.length > 0) {
      for (const alert of managerEscalations) {
        const tenant = await getTenantById(alert.tenant_id);
        if (!tenant) continue;

        const managerPhone = normalizePhoneNumber(tenant.manager_phone);
        const staffPhone = normalizePhoneNumber(tenant.staff_phone);

        // Only send if manager number is defined and distinct from staff
        if (managerPhone && managerPhone !== staffPhone && tenant.wa_access_token && tenant.wa_phone_number_id) {
          const token = decryptToken(tenant.wa_access_token);
          if (token) {
            console.log(`[Escalation Cron] Escalating alert ${alert.id} to Manager (${managerPhone})`);
            const managerMsg = `⚠️ *ESCALATION ALERT — UNACKNOWLEDGED*\n\nYour staff has not acknowledged this alert within 5 minutes:\n\n*${alert.title}*\n\n${alert.body}`;
            
            // Send as interactive button if possible to let manager acknowledge directly
            try {
              await sendInteractiveButtonsMessage(
                token,
                tenant.wa_phone_number_id,
                managerPhone,
                managerMsg.slice(0, 1000), // Meta limit
                [
                  { id: `ack_notification:${alert.id}`, title: '✅ Acknowledge' }
                ]
              );
            } catch {
              // Fallback to text message
              await sendTextMessage(token, tenant.wa_phone_number_id, managerPhone, managerMsg).catch(() => {});
            }
          }
        }

        // Update stage to manager escalated
        await supabaseAdmin
          .from('business_notifications')
          .update({
            escalation_stage: 'escalated_to_manager',
            updated_at: new Date().toISOString(),
          })
          .eq('id', alert.id);

        escalatedCount++;
      }
    }

    // 2. Fetch unacknowledged alerts that need Admin/Email Escalation (Stage 2: > 15 mins since manager escalation, stage = escalated_to_manager)
    const { data: adminEscalations } = await supabaseAdmin
      .from('business_notifications')
      .select('id, tenant_id, title, body, created_at')
      .is('acknowledged_at', null)
      .eq('escalation_stage', 'escalated_to_manager')
      .lt('created_at', fifteenMinutesAgo)
      .limit(10);

    if (adminEscalations && adminEscalations.length > 0) {
      for (const alert of adminEscalations) {
        const tenant = await getTenantById(alert.tenant_id);
        
        // Trigger Email Fallback to Business Owner
        if (tenant && tenant.staff_email) {
          await notifyTenant({
            staffEmail: tenant.staff_email,
            businessName: tenant.business_name || 'Your Business',
            subject: `CRITICAL UNACKNOWLEDGED ALERT — ${alert.title}`,
            summary: `This is a critical escalation. The following alert has remained UNACKNOWLEDGED for over 20 minutes:\n\n${alert.body}`,
          }).catch(() => {});
        }

        // Alert Platform Administrators
        await notifyAdmin({
          dedupeKey: `critical_unacknowledged_alert:${alert.id}`,
          subject: `Critical Alert SLA Breached — ${tenant?.business_name || 'Tenant'}`,
          summary: `Alert "${alert.title}" remains unacknowledged after 20 minutes of escalations. Check dashboard and contact client.`,
          context: { alertId: alert.id, tenantId: alert.tenant_id, title: alert.title },
        }).catch(() => {});

        // Mark as exhausted
        await supabaseAdmin
          .from('business_notifications')
          .update({
            escalation_stage: 'exhausted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', alert.id);

        exhaustedCount++;
      }
    }

    const duration = Date.now() - startedAt;
    console.log(`[Escalation Cron] Completed execution: escalated=${escalatedCount} exhausted=${exhaustedCount} duration=${duration}ms`);
    return NextResponse.json({ success: true, escalated: escalatedCount, exhausted: exhaustedCount, durationMs: duration });
  } catch (err) {
    console.error(`[Escalation Cron] Unexpected error:`, (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
