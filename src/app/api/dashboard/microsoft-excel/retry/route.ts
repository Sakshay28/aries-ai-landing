import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MicrosoftExcelWorkerService } from '@/lib/integrations/microsoft-excel-worker';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // jobId is an audit_log id — look up phone + event_type from the audit log
    const { data: auditLog, error: logError } = await supabaseAdmin
      .from('microsoft_excel_audit_logs')
      .select('id, phone, event_type, lead_id')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (logError) throw logError;
    if (!auditLog) {
      return NextResponse.json({ error: 'Audit log entry not found' }, { status: 404 });
    }

    // Re-enqueue the phone into the sync queue (upsert merges if already pending)
    const { error: upsertError } = await supabaseAdmin
      .from('microsoft_excel_sync_queue')
      .upsert(
        {
          tenant_id: tenantId,
          lead_id: auditLog.lead_id ?? null,
          phone: auditLog.phone,
          event_type: auditLog.event_type,
          status: 'pending',
          attempts: 0,
          error_message: null,
          run_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,phone' }
      );

    if (upsertError) throw upsertError;

    console.log(`🔄 [EXCEL retry] re-enqueued phone ${auditLog.phone} for tenant ${tenantId}`);

    // Immediately drain the queue so the retry fires without waiting for cron
    MicrosoftExcelWorkerService.processQueue('manual-retry', 5).catch(err =>
      console.error('⚠️ [EXCEL retry] processQueue error (non-fatal):', err)
    );

    return NextResponse.json({ success: true, message: 'Job rescheduled for immediate retry' });
  } catch (err: any) {
    console.error('❌ [EXCEL retry api] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
