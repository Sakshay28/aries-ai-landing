import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getAvailableSlots } from '@/lib/integrations/google-calendar';

// GET /api/dashboard/google-calendar/slots?date=2026-05-20&duration=30
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const date     = searchParams.get('date');
  const duration = parseInt(searchParams.get('duration') ?? '30', 10);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const slots = await getAvailableSlots(tenantId, date, duration);
    return NextResponse.json({ success: true, data: slots });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not connected')) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
