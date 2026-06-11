import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { notifyAdmin } from '@/lib/alerts/admin';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  }

  await notifyAdmin({
    dedupeKey: `broadcast-test-alert-${tenantId}-${Date.now()}`,
    subject: 'Broadcast alert test — this is a test',
    summary: `Test alert triggered by ${user.email || user.id}. If you received this email, broadcast failure alerting is working correctly.`,
    context: { tenantId, triggeredBy: user.email || user.id },
  });

  return NextResponse.json({ success: true, message: 'Alert sent — check your PLATFORM_ADMIN_EMAIL inbox' });
}
