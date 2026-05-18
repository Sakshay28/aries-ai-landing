// ═══════════════════════════════════════════════════════════
// Flow Simulator API
// ═══════════════════════════════════════════════════════════
// POST /api/dashboard/flows/:id/simulate
// Body: { message: string }
// Returns the execution trace without sending any WhatsApp
// messages or writing to the DB — safe to call any time.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { simulateFlow } from '@/lib/flows/engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: flowId } = await params;
  const body = await req.json().catch(() => ({})) as { message?: string };
  const testMessage = (body.message || '').trim();

  if (!testMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const result = await simulateFlow(flowId, testMessage, tenantId);

  if (!result.matched) {
    return NextResponse.json({ error: 'Flow not found or trigger did not match' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: result });
}
