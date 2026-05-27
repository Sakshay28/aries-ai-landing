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

  // Verify ownership
  const { data: entry } = await supabaseAdmin
    .from('dead_letter_queue')
    .select('tenant_id')
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
    await markDLQRetried(id);
    // NOTE: actual re-queue is done by BullMQ worker polling retried entries
    return NextResponse.json({ success: true, message: 'Marked for retry — worker will pick up shortly' });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}
