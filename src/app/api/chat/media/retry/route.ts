import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { retryChatMedia } from '@/lib/media/outbound-media.server';

export const maxDuration = 30;

// POST /api/chat/media/retry  { messageId }
// Re-delivers a failed (or timed-out) operator attachment from the file already
// in storage. Atomic claim — concurrent retries send at most once.
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  try {
    const result = await retryChatMedia({ tenantId, messageId: body?.messageId });
    return NextResponse.json(
      { success: result.ok, code: result.code, error: result.error, message: result.message },
      { status: result.httpStatus }
    );
  } catch (err) {
    console.error('[chat/media/retry] unexpected error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
