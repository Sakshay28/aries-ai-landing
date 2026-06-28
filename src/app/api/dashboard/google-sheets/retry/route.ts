import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // 1. Verify the job belongs to this tenant and update it
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('google_sheets_sync_queue')
      .update({
        status: 'pending',
        attempts: 0,
        run_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .select('id, phone, event_type')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedJob) {
      // If no job was found in the queue, it might have been deleted (completed)
      // or already processed. Let's check if the client wants to queue a manual sync!
      return NextResponse.json({ error: 'Job not found in queue or already processed' }, { status: 404 });
    }

    console.log(`🔄 [GSHEETS retry api] manually queued retry for job ${jobId} (phone: ${updatedJob.phone})`);

    // Log the retry action in audit logs
    await supabaseAdmin.from('google_sheets_audit_logs').insert({
      tenant_id: tenantId,
      phone: updatedJob.phone,
      event_type: updatedJob.event_type,
      status: 'failed', // Mark as failed temporarily since it failed initially
      error_message: 'Manual retry initiated',
      latency_ms: 0,
      details: { jobId, retry_action: 'manual_initiated' },
    });

    return NextResponse.json({ success: true, message: 'Job rescheduled for immediate retry' });
  } catch (err: any) {
    console.error('❌ [GSHEETS retry api] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
