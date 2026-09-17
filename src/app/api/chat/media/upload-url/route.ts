import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { issueChatMediaUpload } from '@/lib/media/outbound-media.server';

// POST /api/chat/media/upload-url
// Step 1 of an operator attachment send: returns a one-time signed URL the
// browser uploads the file to directly (bypasses the 4.5 MB function body limit).
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Bounds storage abuse per tenant; generous for a busy human inbox.
  const rl = await checkRedisRateLimit(`chat_media_upload:${tenantId}`, 600, 86400);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Daily attachment limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await issueChatMediaUpload({
      tenantId,
      conversationId: body.conversationId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: body.size,
    });
    if (!result.ok || !result.upload) {
      return NextResponse.json({ success: false, code: result.code, error: result.error }, { status: result.httpStatus });
    }
    return NextResponse.json({ success: true, ...result.upload });
  } catch (err) {
    console.error('[chat/media/upload-url] unexpected error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
