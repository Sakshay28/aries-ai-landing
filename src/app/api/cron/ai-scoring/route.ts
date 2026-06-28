// GET|POST /api/cron/ai-scoring
// Processes pending AI analysis jobs from the ai_jobs queue.
// Runs every 2 minutes via Vercel Cron (vercel.json).
//
// Design:
//   - Claims a batch of pending/retry jobs atomically
//   - Calls runConversationIntelligence() per job
//   - On success: marks job done + flushes cost buckets
//   - On retry signal: sets next_retry_at with exponential backoff
//   - On exhaustion: moves to dead_letter, optionally triggers manual review
//   - Idempotent: safe to run multiple times; claimed jobs are locked

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }              from '@/lib/supabase/admin';
import { runConversationIntelligence } from '@/lib/scoring/conversation-intelligence';
import { flushBuckets }               from '@/lib/scoring/cost-tracker';
import { shouldEscalateToManualReview } from '@/lib/scoring/failure-strategy';
import { normalizeIndustry }           from '@/lib/scoring/industry-profiles';
import { randomUUID }                  from 'crypto';

export const maxDuration = 60;

// ── Auth ─────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

// ── Constants ─────────────────────────────────────────────────────────────

const BATCH_SIZE      = 10;  // jobs per cron tick
const MAX_RETRIES     = 3;
const RETRY_DELAYS_MS = [30_000, 120_000, 300_000] as const;

// ── Route ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest)  { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchId = randomUUID().slice(0, 8);
  const start   = Date.now();

  console.log(`[ai-scoring cron:${batchId}] starting batch of ${BATCH_SIZE}`);

  // ── 1. Fetch claimable jobs ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data: jobs, error: fetchErr } = await supabaseAdmin
    .from('ai_jobs')
    .select('id, tenant_id, lead_id, conversation_id, status, retry_count, fallback_level, priority, idempotency_key, enqueued_at, payload')
    .in('status', ['pending', 'retry'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('priority',    { ascending: false })
    .order('enqueued_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error(`[ai-scoring cron:${batchId}] fetch error:`, fetchErr.message);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    console.log(`[ai-scoring cron:${batchId}] no jobs — done`);
    await flushCostBuckets(batchId);
    return NextResponse.json({ ok: true, processed: 0, durationMs: Date.now() - start });
  }

  // ── 2. Claim jobs atomically ────────────────────────────────────────────
  const jobIds = jobs.map(j => j.id);
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('ai_jobs')
    .update({ status: 'processing', started_at: now })
    .in('id', jobIds)
    .eq('status', 'pending')   // only claim truly-pending (avoids double-claim race)
    .or('status.eq.retry')     // also claim retry-eligible
    .select('id');

  if (claimErr) {
    console.error(`[ai-scoring cron:${batchId}] claim error:`, claimErr.message);
    return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 });
  }

  const claimedIds = new Set((claimed ?? []).map((r: { id: string }) => r.id));
  const jobsToClaim = jobs.filter(j => claimedIds.has(j.id));

  console.log(`[ai-scoring cron:${batchId}] claimed ${jobsToClaim.length}/${jobs.length} jobs`);

  // ── 3. Process each job ─────────────────────────────────────────────────
  const results = { done: 0, retry: 0, dead: 0, errors: 0 };

  for (const job of jobsToClaim) {
    const jobStart     = Date.now();
    const executionId  = randomUUID().replace(/-/g, '').slice(0, 16);
    const payload      = (job.payload ?? {}) as Record<string, unknown>;

    console.log(`[ai-scoring cron:${batchId}] job=${job.id} tenant=${job.tenant_id} lead=${job.lead_id} retry=${job.retry_count}`);

    try {
      const intelligenceResult = await runConversationIntelligence({
        tenantId:       job.tenant_id,
        leadId:         job.lead_id,
        conversationId: job.conversation_id,
        triggeredBy:    'cron',
        jobId:          job.id,
        executionId,
        jobEnqueuedAt:  job.enqueued_at ?? undefined,
      });

      if (intelligenceResult.success) {
        // Success — mark done
        await supabaseAdmin.from('ai_jobs').update({
          status:        'done',
          completed_at:  new Date().toISOString(),
          fallback_level: intelligenceResult.fallbackLevel,
          processing_ms: Date.now() - jobStart,
        }).eq('id', job.id);

        results.done++;
        console.log(`[ai-scoring cron:${batchId}] job=${job.id} done in ${Date.now() - jobStart}ms status=${intelligenceResult.finalStatus} score=${intelligenceResult.finalScore}`);
      } else {
        // AI failed but fallback handled it
        const fallbackLevel = intelligenceResult.fallbackLevel;
        await markJobDead(job.id, job.tenant_id, fallbackLevel, intelligenceResult.errorMessage ?? 'AI failed, fallback used', Date.now() - jobStart);
        results.dead++;
      }

    } catch (err) {
      const error = err as Error;
      const message = error.message ?? 'unknown';
      results.errors++;

      // RETRY signal from orchestrator: "RETRY:<delayMs>:<message>"
      if (message.startsWith('RETRY:')) {
        const parts    = message.split(':');
        const delayMs  = parseInt(parts[1] ?? '30000', 10);
        const retryAt  = new Date(Date.now() + delayMs).toISOString();
        const newCount = (job.retry_count ?? 0) + 1;

        if (newCount > MAX_RETRIES) {
          await markJobDead(job.id, job.tenant_id, 4, `Retries exhausted after ${newCount} attempts: ${parts.slice(2).join(':')}`, Date.now() - jobStart);
          results.dead++;
        } else {
          await supabaseAdmin.from('ai_jobs').update({
            status:        'retry',
            retry_count:   newCount,
            next_retry_at: retryAt,
            last_error:    parts.slice(2).join(':').slice(0, 500),
            processing_ms: Date.now() - jobStart,
          }).eq('id', job.id);

          results.retry++;
          console.log(`[ai-scoring cron:${batchId}] job=${job.id} retry=${newCount} at=${retryAt}`);
        }
      } else {
        // Unexpected error — check if manual review escalation needed
        const consecutiveFailures = (job.retry_count ?? 0) + 1;
        if (shouldEscalateToManualReview({ fallbackLevel: 4, consecutiveFailures } as any, consecutiveFailures)) {
          await markJobDead(job.id, job.tenant_id, 4, message.slice(0, 500), Date.now() - jobStart);
          await flagManualReview(job.tenant_id, job.lead_id, job.conversation_id, message, executionId);
        } else if (consecutiveFailures >= MAX_RETRIES) {
          await markJobDead(job.id, job.tenant_id, 4, message.slice(0, 500), Date.now() - jobStart);
          results.dead++;
        } else {
          const delayMs = RETRY_DELAYS_MS[Math.min(consecutiveFailures - 1, 2)] ?? 300_000;
          await supabaseAdmin.from('ai_jobs').update({
            status:        'retry',
            retry_count:   consecutiveFailures,
            next_retry_at: new Date(Date.now() + delayMs).toISOString(),
            last_error:    message.slice(0, 500),
            processing_ms: Date.now() - jobStart,
          }).eq('id', job.id);
          results.retry++;
        }
        console.error(`[ai-scoring cron:${batchId}] job=${job.id} error:`, message);
      }
    }
  }

  // ── 4. Flush cost buckets to DB ─────────────────────────────────────────
  const flushedBuckets = await flushCostBuckets(batchId);

  const totalMs = Date.now() - start;
  console.log(`[ai-scoring cron:${batchId}] complete in ${totalMs}ms — done=${results.done} retry=${results.retry} dead=${results.dead} errors=${results.errors} costBuckets=${flushedBuckets}`);

  return NextResponse.json({
    ok:       true,
    batchId,
    results,
    flushedCostBuckets: flushedBuckets,
    durationMs: totalMs,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function markJobDead(
  jobId: string, tenantId: string, fallbackLevel: number,
  lastError: string, processingMs: number,
): Promise<void> {
  await supabaseAdmin.from('ai_jobs').update({
    status:        'dead',
    fallback_level: fallbackLevel,
    last_error:    lastError.slice(0, 500),
    processing_ms: processingMs,
    completed_at:  new Date().toISOString(),
  }).eq('id', jobId);
  console.warn(`[ai-scoring] job=${jobId} moved to dead_letter — ${lastError.slice(0, 100)}`);
}

async function flagManualReview(
  tenantId: string, leadId: string, conversationId: string,
  reason: string, executionId: string,
): Promise<void> {
  try {
    await supabaseAdmin.from('lead_feedback').insert({
      tenant_id:       tenantId,
      lead_id:         leadId,
      conversation_id: conversationId,
      feedback_type:   'manual_review',
      comment:         `Auto-escalated by AI cron. ExecutionId=${executionId}. Reason: ${reason.slice(0, 400)}`,
      submitted_by:    'system',
      resolution:      'pending',
    });
  } catch (e) {
    console.error('[ai-scoring] flagManualReview error:', (e as Error).message);
  }
}

async function flushCostBuckets(batchId: string): Promise<number> {
  try {
    const buckets = flushBuckets();
    if (buckets.length === 0) return 0;

    await supabaseAdmin.from('tenant_ai_costs').upsert(
      buckets.map(b => ({
        tenant_id:         b.tenantId,
        cost_date:         b.date,
        cost_hour:         new Date().getUTCHours(),
        provider:          b.provider,
        model:             b.model,
        total_calls:       b.totalCalls,
        skipped_calls:     b.skippedCalls,
        cached_calls:      b.cachedCalls,
        failed_calls:      b.failedCalls,
        total_tokens_in:   b.totalTokensIn,
        total_tokens_out:  b.totalTokensOut,
        total_cost_usd:    b.totalCostUsd,
        cache_savings_usd: b.cacheSavingsUsd,
        skip_savings_usd:  b.skipSavingsUsd,
        avg_latency_ms:    b.totalCalls > 0 ? Math.round(b.totalLatencyMs / b.totalCalls) : 0,
        avg_cost_per_call_usd: b.totalCalls > 0 ? b.totalCostUsd / b.totalCalls : 0,
      })),
      { onConflict: 'tenant_id,cost_date,cost_hour,provider,model', ignoreDuplicates: false },
    );
    return buckets.length;
  } catch (e) {
    console.error(`[ai-scoring cron:${batchId}] flushCostBuckets error:`, (e as Error).message);
    return 0;
  }
}
