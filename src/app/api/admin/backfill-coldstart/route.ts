// POST /api/admin/backfill-coldstart
//
// One-time backfill for leads that entered the system BEFORE the cold-start
// scorer existed (e.g. the ~1,050 imported contacts sitting at lead_score=0 /
// lead_status='new'). These have NO conversation, so the AI worker can't score
// them — /api/admin/backfill-ai-scoring deliberately skips them. This route gives
// them the same deterministic metadata baseline a fresh import now gets.
//
// SAFE BY DEFAULT: dry-run unless called with ?apply=true. Dry-run reports the
// status distribution it WOULD produce without writing anything.
//
// Only touches leads that are: not converted/lost, not manually overridden, at
// score 0, and have no conversation. Never downgrades an engaged lead.
//
// Auth: platform-admin only. Re-runnable; self-paginates within a time budget.

import { NextRequest, NextResponse }  from 'next/server';
import { supabaseAdmin }              from '@/lib/supabase/admin';
import { getCurrentUser }             from '@/lib/auth/getCurrentUser';
import { computeColdStartBaseline }   from '@/lib/scoring/cold-start';

export const maxDuration = 60; // clamped to 10s on Hobby — the time guard below respects that

const PAGE          = 100;    // leads fetched per page
const UPDATE_CHUNK   = 20;     // parallel updates per chunk
const TIME_BUDGET_MS = 8_000;  // stop before the platform's function timeout

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apply = new URL(req.url).searchParams.get('apply') === 'true';
  const start = Date.now();

  let scanned = 0;
  let updated = 0;
  const statusPreview: Record<string, number> = {};
  // Request-local accumulator for chunked writes (never module-scoped — that would
  // leak state across serverless invocations).
  const pending: { id: string; baseline: ReturnType<typeof computeColdStartBaseline> }[] = [];

  // Loop pages until we run out of candidates or the time budget is spent.
  // In dry-run we page by offset (no rows change); in apply mode each page's rows
  // leave the candidate set once written, so we always read the next unscored page.
  let offset = 0;
  while (Date.now() - start < TIME_BUDGET_MS) {
    let q = supabaseAdmin
      .from('leads')
      .select('id, name, email, phone, notes, source_detail, channel, conversations(id)')
      .not('lead_status', 'in', '("converted","lost")')
      .or('manual_override.is.null,manual_override.eq.false')
      .eq('lead_score', 0)
      .limit(PAGE);

    if (!apply) q = q.range(offset, offset + PAGE - 1);

    const { data: leads, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) break;

    // Only leads with NO conversation — those with messages belong to the AI worker.
    const candidates = leads.filter(
      (l) => !Array.isArray(l.conversations) || l.conversations.length === 0
    );

    for (const lead of candidates) {
      scanned++;
      const baseline = computeColdStartBaseline({
        name:    lead.name,
        email:   lead.email,
        phone:   lead.phone,
        notes:   lead.notes,
        source:  lead.source_detail ?? lead.channel,
        channel: lead.channel,
      });
      statusPreview[baseline.status] = (statusPreview[baseline.status] ?? 0) + 1;
      // Nothing to write when the baseline is still 0 (e.g. no metadata at all).
      if (baseline.score === 0 && baseline.status === 'cold') continue;

      if (apply) {
        // Deferred: chunked parallel writes below via the accumulator.
        pending.push({ id: lead.id, baseline });
      }
    }

    // Flush writes in bounded parallel chunks.
    if (apply && pending.length > 0) {
      for (let i = 0; i < pending.length; i += UPDATE_CHUNK) {
        const chunk = pending.slice(i, i + UPDATE_CHUNK);
        await Promise.all(chunk.map((p) =>
          supabaseAdmin.from('leads').update({
            lead_score:     p.baseline.score,
            lead_status:    p.baseline.status,
            buying_signals: p.baseline.signals,
          }).eq('id', p.id).eq('lead_score', 0) // guard: only if still unscored
        ));
        updated += chunk.length;
        if (Date.now() - start >= TIME_BUDGET_MS) break;
      }
      pending.length = 0;
    }

    if (!apply) {
      offset += PAGE;
      if (leads.length < PAGE) break;
    } else if (candidates.length < PAGE) {
      break; // last page consumed
    }
  }

  const timedOut = Date.now() - start >= TIME_BUDGET_MS;
  console.log(`[backfill-coldstart] apply=${apply} scanned=${scanned} updated=${updated} timedOut=${timedOut}`);

  return NextResponse.json({
    mode:            apply ? 'apply' : 'dry_run',
    scanned,
    updated:         apply ? updated : 0,
    would_update:    apply ? undefined : Object.values(statusPreview).reduce((a, b) => a + b, 0),
    status_preview:  statusPreview,
    timed_out:       timedOut,
    message: apply
      ? `Scored ${updated} cold leads.${timedOut ? ' Time budget hit — call again to continue.' : ' Done.'}`
      : `Dry run: ${scanned} candidates. Would produce the status_preview distribution. Re-call with ?apply=true to write.${timedOut ? ' (Sampled up to the time budget.)' : ''}`,
  });
}
