import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'template-media';

const ALLOWED: Record<string, { ext: string; mediaType: 'image' | 'video' | 'document'; maxMB: number }> = {
  'image/jpeg':       { ext: 'jpg',  mediaType: 'image',    maxMB: 5   },
  'image/jpg':        { ext: 'jpg',  mediaType: 'image',    maxMB: 5   },
  'image/png':        { ext: 'png',  mediaType: 'image',    maxMB: 5   },
  'image/webp':       { ext: 'webp', mediaType: 'image',    maxMB: 5   },
  'image/gif':        { ext: 'gif',  mediaType: 'image',    maxMB: 5   },
  'video/mp4':        { ext: 'mp4',  mediaType: 'video',    maxMB: 16  },
  'video/quicktime':  { ext: 'mov',  mediaType: 'video',    maxMB: 16  },
  'video/webm':       { ext: 'webm', mediaType: 'video',    maxMB: 16  },
  'video/x-m4v':      { ext: 'm4v',  mediaType: 'video',    maxMB: 16  },
  'application/pdf':  { ext: 'pdf',  mediaType: 'document', maxMB: 100 },
  'application/msword': { ext: 'doc', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', mediaType: 'document', maxMB: 100 },
  'application/vnd.ms-excel': { ext: 'xls', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', mediaType: 'document', maxMB: 100 },
  'application/vnd.ms-powerpoint': { ext: 'ppt', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', mediaType: 'document', maxMB: 100 },
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

async function ensureBucket() {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some(b => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }
  } catch {}
}

export async function POST(request: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
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
      { error: `Unsupported file type "${ext}". Allowed: JPEG/PNG/WebP/GIF, MP4/MOV/WebM, PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX` },
      { status: 400 }
    );
  }

  const sizeMB = size / (1024 * 1024);
  if (sizeMB > meta.maxMB) {
    const label = meta.mediaType === 'image' ? 'Images' : meta.mediaType === 'video' ? 'Videos' : 'Documents';
    return NextResponse.json(
      { error: `${label} must be under ${meta.maxMB} MB (this file is ${sizeMB.toFixed(1)} MB)` },
      { status: 400 }
    );
  }

  await ensureBucket();

  const folder = meta.mediaType === 'video' ? 'videos' : meta.mediaType === 'document' ? 'documents' : 'images';
  const storagePath = `${tenantId}/scripted-replies/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${meta.ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create upload URL' }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
    publicUrl: urlData.publicUrl,
    contentType,
    mediaType: meta.mediaType,
  });
}
