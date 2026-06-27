import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// GET /api/dashboard/automations/diagnostics
// Real health check for the automation pipeline. This reflects the ACTUAL
// architecture (Postgres queue + serverless cron/piggyback drain) — there is
// no BullMQ/Redis worker, so we do not report fake worker status.
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // 1. Database reachable + automations table
  const { count: autoCount, error: dbErr } = await supabaseAdmin
    .from('automations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  checks.database = {
    ok: !dbErr,
    detail: dbErr ? dbErr.message : `${autoCount ?? 0} automations`,
  };

  // 2. Active automations
  const { count: activeCount } = await supabaseAdmin
    .from('automations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  checks.active_automations = {
    ok: (activeCount ?? 0) > 0,
    detail: `${activeCount ?? 0} active`,
  };

  // 3. WhatsApp configured for this tenant
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id, is_active')
    .eq('id', tenantId)
    .single();
  const waOk = !!tenant?.wa_access_token && !!tenant?.wa_phone_number_id;
  checks.whatsapp = {
    ok: waOk,
    detail: waOk ? 'Access token + phone number set' : 'WhatsApp not connected',
  };

  // 4. Queue depth (pending) + oldest pending age — surfaces a stuck drain
  const { data: pending } = await supabaseAdmin
    .from('automation_queue')
    .select('scheduled_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(1000);
  const now = Date.now();
  const duePending = (pending || []).filter(p => new Date(p.scheduled_at).getTime() <= now);
  const oldestDueAgeMin = duePending.length
    ? Math.round((now - new Date(duePending[0].scheduled_at).getTime()) / 60000)
    : 0;
  // If the oldest DUE item has been waiting > 5 min, the minute-cron drain isn't running.
  checks.queue_drain = {
    ok: oldestDueAgeMin <= 5,
    detail: duePending.length === 0
      ? `${(pending || []).length} pending, none due yet`
      : `${duePending.length} due, oldest waiting ${oldestDueAgeMin} min${oldestDueAgeMin > 5 ? ' ⚠️ cron may not be running' : ''}`,
  };

  // 5. Stuck 'processing' items (claimed but never finished)
  const { count: stuckCount } = await supabaseAdmin
    .from('automation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'processing');
  checks.no_stuck_items = {
    ok: (stuckCount ?? 0) === 0,
    detail: `${stuckCount ?? 0} stuck in processing`,
  };

  // 6. Recent failures
  const { count: failedCount } = await supabaseAdmin
    .from('automation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'failed');
  checks.failures = {
    ok: (failedCount ?? 0) === 0,
    detail: `${failedCount ?? 0} failed sends`,
  };

  // 7. Drain heartbeat (M4) — proves the minute-cron actually ran recently,
  // independent of whether this tenant currently has anything due. Global
  // signal (one row), so it's the same for every tenant.
  const { data: hb } = await supabaseAdmin
    .from('system_heartbeats')
    .select('last_run_at, detail')
    .eq('key', 'automation_drain')
    .maybeSingle();
  if (hb?.last_run_at) {
    const ageSec = Math.round((now - new Date(hb.last_run_at).getTime()) / 1000);
    checks.cron_heartbeat = {
      // The cron fires every minute; allow 3 min of slack before flagging.
      ok: ageSec <= 180,
      detail: ageSec <= 180
        ? `Last drain ${ageSec}s ago`
        : `Last drain ${Math.round(ageSec / 60)} min ago ⚠️ cron may be down`,
    };
  } else {
    checks.cron_heartbeat = {
      ok: false,
      detail: 'No drain recorded yet — run migration 20260627 + verify pg_cron',
    };
  }

  const healthy = Object.values(checks).every(c => c.ok);
  return NextResponse.json({ healthy, checks });
}
