import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';

const BUCKET = 'knowledge-docs';

const ALLOWED: Record<string, { ext: string; mediaType: 'video' | 'image' | 'document'; maxMB: number }> = {
  'video/mp4':       { ext: 'mp4',  mediaType: 'video',    maxMB: 16  },
  'video/quicktime': { ext: 'mov',  mediaType: 'video',    maxMB: 16  },
  'video/webm':      { ext: 'webm', mediaType: 'video',    maxMB: 16  },
  'image/jpeg':      { ext: 'jpg',  mediaType: 'image',    maxMB: 5   },
  'image/png':       { ext: 'png',  mediaType: 'image',    maxMB: 5   },
  'image/webp':      { ext: 'webp', mediaType: 'image',    maxMB: 5   },
  'application/pdf': { ext: 'pdf',  mediaType: 'document', maxMB: 100 },
};

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
};

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRedisRateLimit(`kb_upload:${tenantId}`, 20, 86400);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Daily upload limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.filename || body.size == null) {
    return NextResponse.json({ error: 'filename and size are required' }, { status: 400 });
  }

  const { filename, size } = body;
  let contentType: string = body.contentType || '';

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (!contentType || contentType === 'application/octet-stream') {
    contentType = EXT_TO_MIME[ext] || '';
  }

  const meta = ALLOWED[contentType];
  if (!meta) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext}". Allowed: MP4/MOV/WebM (video), JPG/PNG/WebP (image), PDF (document)` },
      { status: 400 }
    );
  }

  const sizeMB = size / (1024 * 1024);
  if (sizeMB > meta.maxMB) {
    const label = meta.mediaType === 'video' ? 'Videos' : meta.mediaType === 'image' ? 'Images' : 'Documents';
    return NextResponse.json(
      { error: `${label} must be under ${meta.maxMB} MB (this file is ${sizeMB.toFixed(1)} MB)` },
      { status: 400 }
    );
  }

  const storagePath = `${tenantId}/${Date.now()}_${filename.replace(/\s+/g, '_')}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create upload URL' }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    contentType,
    mediaType: meta.mediaType,
    ext,
  });
}
