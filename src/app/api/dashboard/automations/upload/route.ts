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
  'application/pdf':  { ext: 'pdf',  mediaType: 'document', maxMB: 100 },
  'application/msword': { ext: 'doc', mediaType: 'document', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', mediaType: 'document', maxMB: 100 },
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  let contentType = file.type;
  if (!contentType || contentType === 'application/octet-stream') {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    contentType = EXT_TO_MIME[ext] || file.type;
  }

  const meta = ALLOWED[contentType];
  if (!meta) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: JPEG/PNG/WebP/GIF, MP4/MOV/WebM, PDF/DOC/DOCX' },
      { status: 400 }
    );
  }

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > meta.maxMB) {
    return NextResponse.json(
      { error: `File must be under ${meta.maxMB} MB (this file is ${sizeMB.toFixed(1)} MB)` },
      { status: 400 }
    );
  }

  await ensureBucket();

  const folder = meta.mediaType === 'video' ? 'videos' : meta.mediaType === 'document' ? 'documents' : 'images';
  const path = `${tenantId}/automations/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${meta.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl, path, mediaType: meta.mediaType });
}
