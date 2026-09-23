// GET /api/dashboard/whatsapp/health
//
// Whether this tenant's WhatsApp channel can actually send right now. Backs the
// "WhatsApp is offline" banner in the inbox — the piece that was missing when
// Globesome sent nothing for 25 days while its inbox looked perfectly healthy.
//
// Reads only. The row is written by the send path (instantly, on a
// credential-class failure) and by /api/cron/wa-credential-health (daily).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('wa_credential_health')
    .select('status, fault_kind, fault_title, fault_action, first_failed_at, last_checked_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // A missing table (migration not yet applied) or a missing row must never
  // break the inbox — the banner simply stays hidden.
  if (error) {
    console.error('[wa-health] dashboard read failed:', error.message);
    return NextResponse.json({ status: 'unknown' });
  }

  return NextResponse.json(data ?? { status: 'unknown' });
}
