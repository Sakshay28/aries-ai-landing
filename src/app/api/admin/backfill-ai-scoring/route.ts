// POST /api/admin/backfill-ai-scoring
//
// One-time backfill: queues every active lead that has never been AI-analysed
// into ai_jobs. The cron (/api/cron/ai-scoring, every 2 min) picks them up
// automatically — no extra work needed after calling this endpoint.
//
// Idempotent: safe to call multiple times; duplicate leads are ignored via
// the idempotency_key 'backfill_<lead_id>'.
//
// Auth: platform-admin only (same gate as /api/admin/provision).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { getCurrentUser }            from '@/lib/auth/getCurrentUser';

const BATCH_SIZE = 500; // max leads to queue in one call (well above 20-client ceiling)

export async function POST(_req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── 1. Find every active lead that has never been AI-analysed ─────────────
  //    We join against conversations so we only queue leads that actually have
  //    something for the AI to read.
  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from('leads')
    .select('id, tenant_id, lead_status')
    .not('lead_status', 'in', '("converted","lost")')
    .is('ai_last_analyzed_at', null)
    .limit(BATCH_SIZE);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ queued: 0, message: 'All active leads already have AI scores.' });
  }

  const leadIds = leads.map(l => l.id);

  // ── 2. Get the latest conversation_id for each lead ───────────────────────
  //    We pull all conversations for these leads and deduplicate in JS to get
  //    the most recent one per lead (DISTINCT ON isn't available in the client).
  const { data: convRows, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select('id, lead_id, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  // Build lead_id → latest conversation_id map
  const latestConv = new Map<string, string>();
  for (const row of (convRows ?? [])) {
    if (!latestConv.has(row.lead_id)) {
      latestConv.set(row.lead_id, row.id);
    }
  }

  // Only queue leads that actually have a conversation (AI needs messages)
  const leadsWithConvs = leads.filter(l => latestConv.has(l.id));
  const skippedNoConv  = leads.length - leadsWithConvs.length;

  if (leadsWithConvs.length === 0) {
    return NextResponse.json({
      queued:  0,
      skipped: skippedNoConv,
      message: 'No active leads have conversations yet.',
    });
  }

  // ── 3. Upsert into ai_jobs ────────────────────────────────────────────────
  //    Priority 3 (lower than live messages at 5-7) so live traffic goes first.
  //    idempotency_key = 'backfill_<lead_id>' prevents double-queuing on re-run.
  const jobs = leadsWithConvs.map(lead => ({
    tenant_id:       lead.tenant_id,
    lead_id:         lead.id,
    conversation_id: latestConv.get(lead.id)!,
    status:          'pending',
    priority:        3,
    trigger_type:    'backfill',
    idempotency_key: `backfill_${lead.id}`,
    enqueued_at:     new Date().toISOString(),
    payload:         JSON.stringify({ source: 'backfill', queuedBy: me.id }),
  }));

  const { error: upsertErr } = await supabaseAdmin
    .from('ai_jobs')
    .upsert(jobs, { onConflict: 'idempotency_key', ignoreDuplicates: true });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // ── 4. Estimate how long the cron will take ───────────────────────────────
  //    Cron runs every 2 min, processes 10 jobs per tick.
  const ticksNeeded    = Math.ceil(leadsWithConvs.length / 10);
  const estMinutes     = ticksNeeded * 2;

  console.log(`[backfill-ai-scoring] queued ${leadsWithConvs.length} leads (skipped ${skippedNoConv} with no conversations)`);

  return NextResponse.json({
    queued:             leadsWithConvs.length,
    skipped_no_conv:    skippedNoConv,
    est_completion_min: estMinutes,
    message:            `${leadsWithConvs.length} leads queued. The cron will process them in ~${estMinutes} minutes. No action needed — just wait.`,
  });
}
