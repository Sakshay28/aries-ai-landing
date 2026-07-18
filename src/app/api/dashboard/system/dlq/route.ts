import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { getDLQEntries, ignoreDLQEntry, markDLQRetried } from '@/lib/queue/deadLetter';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET — list DLQ entries for this tenant
export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const entries = await getDLQEntries(guard.tenantId);
  return NextResponse.json({ success: true, data: entries });
}

// POST — retry or ignore a DLQ entry
export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;

  const { action, id } = await req.json().catch(() => ({}));
  if (!id || !action) return NextResponse.json({ success: false, error: 'id and action required' }, { status: 400 });

  // Verify ownership — fetch the full row, not just tenant_id, since 'retry'
  // needs job_type + payload to actually act on the entry.
  const { data: entry } = await supabaseAdmin
    .from('dead_letter_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (!entry || entry.tenant_id !== guard.tenantId) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  if (action === 'ignore') {
    await ignoreDLQEntry(id);
    return NextResponse.json({ success: true });
  }

  if (action === 'retry') {
    if (entry.status !== 'pending') {
      return NextResponse.json({ success: false, error: `Entry is already "${entry.status}"` }, { status: 409 });
    }

    // Broadcast DLQ entries carry the original broadcast_queue row id in their
    // payload. Re-queuing means putting THAT row back to 'pending' with a fresh
    // attempt budget — there is no separate job runner that polls DLQ status,
    // so the drain (worker.ts / process-queue cron) only ever sees the message
    // again if we do this here.
    if (entry.job_type === 'broadcast') {
      let payload: { queueItemId?: string } = {};
      try { payload = JSON.parse(entry.payload as string); } catch { /* malformed payload */ }

      if (!payload.queueItemId) {
        return NextResponse.json({ success: false, error: 'DLQ entry has no linked queue item — cannot retry' }, { status: 422 });
      }

      const { data: requeued, error: requeueErr } = await supabaseAdmin
        .from('broadcast_queue')
        .update({
          status: 'pending',
          locked_at: null,
          attempt_count: 0,
          next_attempt_at: new Date().toISOString(),
          failure_reason: null,
          processed_at: null,
        })
        .eq('id', payload.queueItemId)
        .eq('tenant_id', guard.tenantId)
        .select('id')
        .maybeSingle();

      if (requeueErr) {
        return NextResponse.json({ success: false, error: `Failed to re-queue message: ${requeueErr.message}` }, { status: 500 });
      }
      if (!requeued) {
        return NextResponse.json({ success: false, error: 'Original queue item no longer exists — the campaign may have been deleted' }, { status: 404 });
      }

      await markDLQRetried(id);
      return NextResponse.json({ success: true, message: 'Message re-queued — the next drain cycle will pick it up.' });
    }

    // No wired re-enqueue path exists yet for other job types (followup,
    // webhook_sync, crm_push, email, ai_job, payment). Marking these 'retried'
    // without actually retrying anything is exactly the silent-failure bug this
    // route used to have for broadcasts — refuse instead of repeating it.
    return NextResponse.json({
      success: false,
      error: `Retry isn't implemented yet for job type "${entry.job_type}". Use Ignore, or resolve manually.`,
    }, { status: 501 });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
