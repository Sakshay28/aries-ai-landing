// ═══════════════════════════════════════════════════════════
// 📊 System Alert Monitoring API Route — /api/dashboard/system/monitoring
// ═══════════════════════════════════════════════════════════
// Exposes real-time latency, success rates, retry counts, and SLA
// compliance metrics for the tenant's WhatsApp staff alert pipeline.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const tenantId = guard.tenantId;

  try {
    // 1. Fetch total, success, failed, and pending alert counts
    const { data: counts, error: countsErr } = await supabaseAdmin
      .from('business_notifications')
      .select('wa_status, attempt_count, acknowledged_at, created_at')
      .eq('tenant_id', tenantId);

    if (countsErr) {
      return NextResponse.json({ success: false, error: countsErr.message }, { status: 500 });
    }

    const total = counts.length;
    let succeeded = 0;
    let failed = 0;
    let pending = 0;
    let totalAttempts = 0;
    let acknowledgedCount = 0;
    let totalAckTimeMs = 0;
    let slaCompliantCount = 0; // acknowledged within 5 minutes (300,000ms)

    for (const item of counts) {
      totalAttempts += (item.attempt_count || 0);

      const status = item.wa_status;
      if (status === 'sent_session' || status === 'sent_template' || status === 'delivered' || status === 'read') {
        succeeded++;
      } else if (status === 'failed' || status === 'no_template') {
        failed++;
      } else {
        pending++;
      }

      if (item.acknowledged_at) {
        acknowledgedCount++;
        const createdTime = new Date(item.created_at).getTime();
        const ackTime = new Date(item.acknowledged_at).getTime();
        const diff = ackTime - createdTime;
        if (diff > 0) {
          totalAckTimeMs += diff;
          if (diff <= 5 * 60 * 1000) {
            slaCompliantCount++;
          }
        }
      }
    }

    const successRate = total > 0 ? (succeeded / total) * 100 : 100;
    const avgAttempts = total > 0 ? totalAttempts / total : 0;
    const avgAckTimeMinutes = acknowledgedCount > 0 ? (totalAckTimeMs / acknowledgedCount) / (60 * 1000) : 0;
    const slaComplianceRate = acknowledgedCount > 0 ? (slaCompliantCount / acknowledgedCount) * 100 : 100;

    return NextResponse.json({
      success: true,
      metrics: {
        totalAlerts: total,
        succeededAlerts: succeeded,
        failedAlerts: failed,
        pendingAlerts: pending,
        successRatePercentage: parseFloat(successRate.toFixed(2)),
        averageAttempts: parseFloat(avgAttempts.toFixed(2)),
        acknowledgedAlerts: acknowledgedCount,
        averageAcknowledgeTimeMinutes: parseFloat(avgAckTimeMinutes.toFixed(2)),
        slaComplianceRatePercentage: parseFloat(slaComplianceRate.toFixed(2)),
      }
    });
  } catch (err) {
    console.error('[monitoring] unexpected error:', (err as Error).message);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
