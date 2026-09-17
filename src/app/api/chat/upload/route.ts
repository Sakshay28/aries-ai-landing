import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { storeAndSendChatMedia } from '@/lib/media/outbound-media.server';

export const maxDuration = 30;

// POST /api/chat/upload (multipart) — LEGACY.
// The inbox now uploads straight to storage via /api/chat/media/upload-url and
// /api/chat/media/send; on Vercel this route can never receive a body over
// 4.5 MB. It stays only so a dashboard tab still running the previous bundle
// keeps working, and it runs the exact same validation + delivery pipeline.
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid upload' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
  }

  try {
    const result = await storeAndSendChatMedia({
      tenantId,
      conversationId: form.get('conversationId'),
      file,
      caption: form.get('caption'),
      replyToMessageId: form.get('replyToMessageId'),
    });
    return NextResponse.json(
      { success: result.ok, code: result.code, error: result.error, message: result.message },
      { status: result.httpStatus }
    );
  } catch (err) {
    console.error('[chat/upload] unexpected error:', (err as Error)?.message);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
