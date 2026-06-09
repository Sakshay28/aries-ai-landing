// ═══════════════════════════════════════════════════════════
// 🖼️ Scripted Replies — Image Upload
// ═══════════════════════════════════════════════════════════
// Uploads an image to Supabase Storage (template-media bucket)
// and returns a permanent public URL ready to use in a
// scripted reply. Reuses the same bucket as template media.
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'template-media';

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

const MAX_MB = 5;

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

  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG, WEBP or GIF allowed' }, { status: 400 });

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_MB) return NextResponse.json({ error: `Max size is ${MAX_MB} MB` }, { status: 400 });

  await ensureBucket();

  const path = `${tenantId}/scripted-replies/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl, path });
}
