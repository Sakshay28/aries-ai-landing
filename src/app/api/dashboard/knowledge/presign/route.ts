import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';

const BUCKET = 'knowledge-docs';

const ALLOWED: Record<string, { ext: string; mediaType: 'video' | 'image' | 'document' | 'text'; maxMB: number }> = {
  // Videos
  'video/mp4':       { ext: 'mp4',  mediaType: 'video',    maxMB: 16  },
  'video/quicktime': { ext: 'mov',  mediaType: 'video',    maxMB: 16  },
  'video/webm':      { ext: 'webm', mediaType: 'video',    maxMB: 16  },
  'video/3gpp':      { ext: '3gp',  mediaType: 'video',    maxMB: 16  },
  // Images
  'image/jpeg':      { ext: 'jpg',  mediaType: 'image',    maxMB: 10  },
  'image/png':       { ext: 'png',  mediaType: 'image',    maxMB: 10  },
  'image/webp':      { ext: 'webp', mediaType: 'image',    maxMB: 10  },
  'image/gif':       { ext: 'gif',  mediaType: 'image',    maxMB: 10  },
  // Documents
  'application/pdf': { ext: 'pdf',  mediaType: 'document', maxMB: 100 },
  'application/msword': { ext: 'doc', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', mediaType: 'document', maxMB: 100 },
  'application/vnd.ms-excel': { ext: 'xls', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', mediaType: 'document', maxMB: 100 },
  'application/vnd.ms-powerpoint': { ext: 'ppt', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', mediaType: 'document', maxMB: 100 },
  // Text formats
  'text/plain':      { ext: 'txt',  mediaType: 'text',     maxMB: 20  },
  'text/markdown':   { ext: 'md',   mediaType: 'text',     maxMB: 20  },
  'text/csv':        { ext: 'csv',  mediaType: 'text',     maxMB: 20  },
  'application/json':{ ext: 'json', mediaType: 'text',     maxMB: 20  },
};

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
};

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRedisRateLimit(`kb_media_upload:${tenantId}`, 300, 86400);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Daily upload limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.filename || body.size == null) {
    return NextResponse.json({ error: 'filename and size are required' }, { status: 400 });
  }

  const { filename, size } = body;
  if (size <= 0) {
    return NextResponse.json({ error: `File "${filename}" is empty (0 bytes).` }, { status: 400 });
  }

  let contentType: string = body.contentType || '';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (!contentType || contentType === 'application/octet-stream') {
    contentType = EXT_TO_MIME[ext] || '';
  }

  const meta = ALLOWED[contentType] || (EXT_TO_MIME[ext] ? ALLOWED[EXT_TO_MIME[ext]] : null);
  if (!meta) {
    return NextResponse.json(
      { error: `Unsupported file type ".${ext}". Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MD, CSV, JSON, JPG, PNG, WEBP, MP4, WebM.` },
      { status: 400 }
    );
  }

  const sizeMB = size / (1024 * 1024);
  if (sizeMB > meta.maxMB) {
    const label = meta.mediaType === 'video' ? 'Videos' : meta.mediaType === 'image' ? 'Images' : meta.mediaType === 'text' ? 'Text files' : 'Documents';
    return NextResponse.json(
      { error: `${label} must be under ${meta.maxMB} MB (this file is ${sizeMB.toFixed(1)} MB)` },
      { status: 400 }
    );
  }

  // Sanitize filename for safe Supabase Storage / S3 path
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  const storagePath = `${tenantId}/${Date.now()}_${sanitized}`;

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
    contentType: contentType || EXT_TO_MIME[ext] || 'application/octet-stream',
    mediaType: meta.mediaType,
    ext,
  });
}
