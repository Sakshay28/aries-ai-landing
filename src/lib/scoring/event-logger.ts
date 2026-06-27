// Immutable audit log for all lead scoring events.
// Written once per signal, never updated.
// Powers the score timeline UI and analytics.

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ScoreBreakdownEntry, ScoringResult } from './lead-scoring-engine';

export interface SignalEventInsert {
  tenant_id: string;
  lead_id: string;
  signal: string;
  label: string;
  points: number;
  score_before: number;
  score_after: number;
  category: ScoreBreakdownEntry['category'] | 'decay' | 'manual' | 'business_event';
  source: 'whatsapp' | 'instagram' | 'booking' | 'payment' | 'manual' | 'decay_cron' | 'business_event';
  conversation_id?: string;
  message_id?: string;
  metadata?: Record<string, unknown>;
}

// Write all new signal events from a ScoringResult in a single batch insert.
// Non-blocking — caller does not await.
export async function logScoringEvents(
  tenantId: string,
  leadId: string,
  result: ScoringResult,
  source: SignalEventInsert['source'],
  conversationId?: string,
  messageId?: string,
): Promise<void> {
  if (result.new_signals.length === 0) return;

  const scoreBefore = result.lead_score - result.score_delta;
  const rows: SignalEventInsert[] = [];
  let runningScore = scoreBefore;

  for (const key of result.new_signals) {
    const entry = result.score_breakdown[key];
    if (!entry) continue;
    const scoreAfter = Math.min(100, Math.max(0, runningScore + entry.points));
    rows.push({
      tenant_id: tenantId,
      lead_id: leadId,
      signal: key,
      label: entry.label,
      points: entry.points,
      score_before: runningScore,
      score_after: scoreAfter,
      category: entry.category as SignalEventInsert['category'],
      source,
      conversation_id: conversationId,
      message_id: messageId,
      metadata: {},
    });
    runningScore = scoreAfter;
  }

  if (rows.length === 0) return;

  const { error } = await supabaseAdmin.from('lead_signal_events').insert(rows);
  if (error) console.error('[event-logger] insert error:', error.message);
}

// Log a single manual or business event (booking, payment, etc.)
export async function logSingleEvent(event: SignalEventInsert): Promise<void> {
  const { error } = await supabaseAdmin.from('lead_signal_events').insert(event);
  if (error) console.error('[event-logger] single event error:', error.message);
}

// Log a status transition to lead_status_history.
export async function logStatusChange(opts: {
  tenantId: string;
  leadId: string;
  fromStatus: string | null;
  toStatus: string;
  trigger: 'scoring' | 'manual' | 'decay' | 'booking' | 'payment';
  actorId?: string;
  reason?: string;
}): Promise<void> {
  // Skip trivial no-ops
  if (opts.fromStatus === opts.toStatus) return;

  const { error } = await supabaseAdmin.from('lead_status_history').insert({
    tenant_id: opts.tenantId,
    lead_id: opts.leadId,
    from_status: opts.fromStatus,
    to_status: opts.toStatus,
    trigger: opts.trigger,
    actor_id: opts.actorId ?? null,
    reason: opts.reason ?? null,
  });
  if (error) console.error('[event-logger] status history error:', error.message);
}
