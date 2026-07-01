// POST /api/dashboard/leads/rescore-all
//
// Re-queues ALL active leads that either:
//   (a) have never been AI-analysed (ai_last_analyzed_at IS NULL), OR
//   (b) are stuck on "new" with score=0 and have conversations, OR
//   (c) were explicitly requested for a full re-score
//
// This is the "fix already-imported leads" endpoint.
// Tenant-scoped: each user only rescores their own leads.
// Idempotent: duplicate leads are skipped via idempotency_key = 'rescore_<lead_id>'.
// The ai-scoring cron picks up the queued jobs automatically (every 2 min).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { getTenantId }               from '@/lib/auth/getTenantId';

const BATCH_LIMIT = 1000; // max per call — well above typical tenant size

export async function POST(_req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 1. Fetch all active leads for this tenant ──────────────────────────────
  //    We include "new", "cold", "warm", "hot", "qualified", "interested" —
  //    skip "converted" and "lost" (terminal states that don't need re-scoring).
  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from('leads')
    .select('id, tenant_id, lead_status, lead_score, ai_last_analyzed_at')
    .eq('tenant_id', tenantId)
    .not('lead_status', 'in', '("converted","lost")')
    .limit(BATCH_LIMIT);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ queued: 0, message: 'No active leads found.' });
  }

  const leadIds = leads.map(l => l.id);

  // ── 2. Get the most recent conversation_id for each lead ──────────────────
  const { data: convRows, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select('id, lead_id, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  // Build lead_id → most-recent conversation_id map
  const latestConv = new Map<string, string>();
  for (const row of (convRows ?? [])) {
    if (!latestConv.has(row.lead_id)) {
      latestConv.set(row.lead_id, row.id);
    }
  }

  // ── 3. Build job list ──────────────────────────────────────────────────────
  //    Only queue leads that actually have conversations (AI needs messages).
  //    Priority 4: lower than live messages (5-7), slightly higher than
  //    platform-admin backfill (3) so tenant-triggered rescores are preferred.
  const jobs = leads
    .filter(l => latestConv.has(l.id))
    .map(lead => ({
      tenant_id:       lead.tenant_id,
      lead_id:         lead.id,
      conversation_id: latestConv.get(lead.id)!,
      status:          'pending',
      priority:        4,
      trigger_type:    'backfill',
      // Using a timestamp-scoped key so re-triggering after a settings change
      // creates new jobs instead of being silently ignored.
      idempotency_key: `rescore_${lead.id}_${Math.floor(Date.now() / 300_000)}`, // 5-min window
      enqueued_at:     new Date().toISOString(),
      retry_count:     0,
      max_retries:     3,
    }));

  const skippedNoConv = leads.length - jobs.length;

  if (jobs.length === 0) {
    return NextResponse.json({
      queued:  0,
      skipped: skippedNoConv,
      message: 'None of your active leads have conversation history yet. Send some messages first.',
    });
  }

  // ── 4. Upsert into ai_jobs (idempotent) ────────────────────────────────────
  const { error: upsertErr } = await supabaseAdmin
    .from('ai_jobs')
    .upsert(jobs, { onConflict: 'idempotency_key', ignoreDuplicates: true });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // ── 5. Return progress estimate ────────────────────────────────────────────
  //    Cron runs every 2 min, processes 10 jobs per tick.
  const ticksNeeded  = Math.ceil(jobs.length / 10);
  const estMinutes   = Math.max(2, ticksNeeded * 2);

  console.log(`[rescore-all] tenant=${tenantId} queued=${jobs.length} skippedNoConv=${skippedNoConv}`);

  return NextResponse.json({
    queued:             jobs.length,
    skipped_no_conv:    skippedNoConv,
    total_leads:        leads.length,
    est_completion_min: estMinutes,
    message:            `${jobs.length} leads queued for AI re-scoring. Results will appear in ~${estMinutes} minutes.`,
  });
}
