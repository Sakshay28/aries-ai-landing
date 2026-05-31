import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'template-media';

const ALLOWED_MIMES: Record<string, { ext: string; maxMB: number }> = {
  'image/jpeg': { ext: 'jpg', maxMB: 5 },
  'image/jpg': { ext: 'jpg', maxMB: 5 },
  'image/png': { ext: 'png', maxMB: 5 },
  'video/mp4': { ext: 'mp4', maxMB: 16 },
  'application/pdf': { ext: 'pdf', maxMB: 100 },
  'application/msword': { ext: 'doc', maxMB: 100 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', maxMB: 100 },
};

// Self-healing bucket verification helper
async function ensureBucketExists() {
  try {
    const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
    if (listErr) {
      console.error('Failed to list buckets during self-healing check:', listErr.message);
      return;
    }
    const exists = buckets?.some((b) => b.name === BUCKET);
    if (!exists) {
      console.log(`Storage bucket "${BUCKET}" missing. Attempting automatic creation...`);
      const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
        public: true,
        allowedMimeTypes: [
          'image/jpeg',
          'image/png',
          'video/mp4',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      });
      if (createErr) {
        console.error(`Self-healing: failed to create storage bucket "${BUCKET}":`, createErr.message);
      } else {
        console.log(`Self-healing: successfully created storage bucket "${BUCKET}".`);
      }
    }
  } catch (err) {
    console.error('Exception encountered during bucket self-healing check:', err);
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // MIME validation
    const allowed = ALLOWED_MIMES[file.type];
    if (!allowed) {
      return NextResponse.json({
        success: false,
        error: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, MP4, PDF, DOC, DOCX.`,
      }, { status: 400 });
    }

    // Size validation
    const sizeBytes = file.size;
    const sizeMB = sizeBytes / (1024 * 1024);
    if (sizeMB > allowed.maxMB) {
      return NextResponse.json({
        success: false,
        error: `File too large: ${sizeMB.toFixed(1)} MB. Max for ${allowed.ext.toUpperCase()}: ${allowed.maxMB} MB.`,
      }, { status: 400 });
    }

    // Self-healing check: Ensure bucket exists
    await ensureBucketExists();

    // Build storage path: {tenantId}/templates/{timestamp}-{random}.{ext}
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${tenantId}/templates/${timestamp}-${rand}.${allowed.ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage bucket upload failure:', uploadError.message);
      return NextResponse.json({
        success: false,
        error: `Storage upload failed: ${uploadError.message}`,
      }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/dashboard/templates/upload error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await request.json() as { path?: string };
    if (!path) {
      return NextResponse.json({ success: false, error: 'Path required' }, { status: 400 });
    }

    // Security check: path must start with tenantId
    if (!path.startsWith(tenantId + '/')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await ensureBucketExists();
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
