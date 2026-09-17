import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendStoredChatMedia } from '@/lib/media/outbound-media.server';

// Clamped to the plan limit on Vercel. Files ≤ 5 MB are relayed to Meta by
// media ID; larger ones go by signed link, so the work stays well inside 10 s.
export const maxDuration = 30;

// POST /api/chat/media/send
// Step 2: verifies the uploaded object, persists the message and delivers it.
// Idempotent on storagePath — repeating the call never sends twice.
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await sendStoredChatMedia({
      tenantId,
      conversationId: body.conversationId,
      storagePath: body.storagePath,
      fileName: body.fileName,
      caption: body.caption,
      replyToMessageId: body.replyToMessageId,
    });
    return NextResponse.json(
      { success: result.ok, code: result.code, error: result.error, message: result.message, deduped: result.deduped },
      { status: result.httpStatus }
    );
  } catch (err) {
    console.error('[chat/media/send] unexpected error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
