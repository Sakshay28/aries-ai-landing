// Lead score decay — applied by the daily cron job.
// Decays scores for leads that have been inactive, preventing permanently
// warm/hot leads from cluttering the sales pipeline.
//
// Rules (configurable per tenant in the future):
//   > 3 days inactive:  -5
//   > 7 days inactive:  -10 additional
//   > 14 days inactive: -20 additional
//   > 30 days inactive: force status back to 'cold' unless manually locked
//
// Decay NEVER affects:
//   - converted leads
//   - leads with manual_status set (sales team has taken ownership)
//   - leads that scored 0 (already cold)

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logSingleEvent, logStatusChange } from './event-logger';
import { SCORE_THRESHOLDS } from './lead-scoring-engine';
import type { LeadStatus } from '@/lib/types';

export interface DecayThreshold {
  days: number;
  points: number;
}

export const DEFAULT_DECAY_THRESHOLDS: DecayThreshold[] = [
  { days: 3,  points: -5  },
  { days: 7,  points: -10 },
  { days: 14, points: -20 },
];

export const FORCE_COLD_DAYS = 30;

export function calculateDecayPoints(
  lastActivityAt: string | null,
  now: Date = new Date(),
): number {
  if (!lastActivityAt) return 0;

  const lastActivity = new Date(lastActivityAt);
  const diffMs = now.getTime() - lastActivity.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  let total = 0;
  for (const threshold of DEFAULT_DECAY_THRESHOLDS) {
    if (diffDays >= threshold.days) total += threshold.points;
  }
  return total; // negative value
}

export function shouldForceCold(lastActivityAt: string | null, now: Date = new Date()): boolean {
  if (!lastActivityAt) return false;
  const diffMs = now.getTime() - new Date(lastActivityAt).getTime();
  return diffMs / (1000 * 60 * 60 * 24) >= FORCE_COLD_DAYS;
}

function deriveStatusFromScore(score: number): LeadStatus {
  if (score >= SCORE_THRESHOLDS.QUALIFIED) return 'qualified';
  if (score >= SCORE_THRESHOLDS.HOT)       return 'hot';
  if (score >= SCORE_THRESHOLDS.WARM)      return 'warm';
  return 'cold';
}

// Process decay for all eligible leads across all tenants (called by cron).
// Returns a summary for logging.
export async function runDecayCron(): Promise<{ processed: number; decayed: number; errors: number }> {
  const now = new Date();
  let processed = 0;
  let decayed = 0;
  let errors = 0;

  // Fetch all leads that are not converted or lost and have no manual locks
  // and have been inactive for at least 3 days
  const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, tenant_id, lead_score, lead_status, auto_status, manual_status, manual_override, manual_stage, last_activity_at')
    .not('lead_status', 'in', '("converted","lost")')
    .or('manual_override.eq.false,manual_override.is.null')
    .is('manual_status', null)
    .lt('last_activity_at', cutoff);

  if (error) {
    console.error('[decay-cron] query error:', error.message);
    return { processed: 0, decayed: 0, errors: 1 };
  }

  for (const lead of leads ?? []) {
    processed++;
    try {
      if (!lead.last_activity_at) continue;

      const diffMs = now.getTime() - new Date(lead.last_activity_at).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      let newStatus: LeadStatus = lead.lead_status as LeadStatus;
      let reason = '';
      let scoreBefore = lead.lead_score ?? 0;
      let newScore = scoreBefore;

      if (diffDays >= 30) {
        newStatus = 'lost';
        newScore = 0;
        reason = 'No activity for 30+ days';
      } else if (diffDays >= 3) {
        if (['interested', 'warm', 'qualified', 'hot'].includes(lead.lead_status)) {
          newStatus = 'cold';
          newScore = Math.max(0, scoreBefore - 15); // Decay score
          reason = 'No activity for 3+ days';
        }
      }

      if (newScore === scoreBefore && newStatus === lead.lead_status) continue;

      await supabaseAdmin
        .from('leads')
        .update({
          lead_score:  newScore,
          lead_status: newStatus,
          auto_status: newStatus,
          ai_stage:    newStatus,
          ai_score:    newScore,
        })
        .eq('id', lead.id);

      // Log decay event
      await logSingleEvent({
        tenant_id:    lead.tenant_id,
        lead_id:      lead.id,
        signal:       newStatus === 'lost' ? 'decay_force_lost' : 'decay_inactivity',
        label:        reason,
        points:       newScore - scoreBefore,
        score_before: scoreBefore,
        score_after:  newScore,
        category:     'decay',
        source:       'decay_cron',
        metadata:     { last_activity_at: lead.last_activity_at, days_inactive: Math.floor(diffDays) },
      });

      if (newStatus !== lead.lead_status) {
        await logStatusChange({
          tenantId:   lead.tenant_id,
          leadId:     lead.id,
          fromStatus: lead.lead_status,
          toStatus:   newStatus,
          trigger:    'decay',
          reason:     reason,
        });
      }

      decayed++;
    } catch (err) {
      console.error(`[decay-cron] lead ${lead.id}:`, err);
      errors++;
    }
  }

  return { processed, decayed, errors };
}
