import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueEmbedding } from '@/lib/ai/embedding-queue';
import { enqueueMediaAnalysis } from '@/lib/ai/media-queue';
import { MediaAnalysisWorkerService } from '@/lib/ai/media-analysis-worker';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { computeSha256, validateFileSignature, findDuplicateByHash } from '@/lib/utils/media-validation';

export const maxDuration = 60; // clamped to 10s on Hobby — see MediaAnalysisWorkerService for the retry story on files whose analysis exceeds that

const TEXT_TYPES = new Set(['txt', 'md', 'csv', 'json', 'html', 'xml']);
const MEDIA_TYPES = new Set(['mp4', 'mov', 'webm', '3gp', 'jpg', 'jpeg', 'png', 'webp', 'gif']);
const DOC_TYPES = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const ALLOWED_EXTS = new Set([...TEXT_TYPES, ...DOC_TYPES, ...MEDIA_TYPES]);
const MAX_BYTES = 500_000;          // 500 KB text cap before truncation
const MAX_UPLOAD_BYTES_TEXT = 20_000_000;  // 20 MB for text
const MAX_UPLOAD_BYTES_MEDIA = 16_000_000; // 16 MB for video/images
const MAX_UPLOAD_BYTES_DOC = 100_000_000;  // 100 MB for documents
const MAX_UPLOADS_PER_DAY = 300;    // per-tenant upload cap (Gemini cost abuse guard)

// ── GET: list all knowledge docs for the tenant ──────────────
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .select('id, filename, file_type, file_url, created_at, embedding, title, description, ai_description, tags, category, processing_status, processing_error, usage_count, manually_edited')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Self-heal jobs a killed serverless invocation left stuck in
  // 'pending'/'processing' — the dashboard's own page load/poll traffic
  // is a more reliable trigger than relying solely on an external
  // cron-job.org entry to hit /api/cron/media-analysis-reconcile. Scoped
  // to this tenant and run after the response is sent so it never slows
  // down the list.
  after(() => MediaAnalysisWorkerService.processQueue(`kb-get:${tenantId}`, 5, tenantId));

  // Generate time-limited signed URLs (1 hour) for any doc stored as a path.
  // Docs uploaded after the switch store a storage path in file_url; older docs
  // stored with a full public URL are returned as-is until re-uploaded.
  const SIGNED_URL_EXPIRY_SECS = 3600;
  const docs = await Promise.all(
    (data || []).map(async (doc) => {
      const storagePath = doc.file_url as string | null;
      if (storagePath && !storagePath.startsWith('http')) {
        const { data: signed } = await supabaseAdmin.storage
          .from('knowledge-docs')
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECS);
        return { ...doc, file_url: signed?.signedUrl ?? null };
      }
      return doc;
    })
  );

  return NextResponse.json({ success: true, data: docs, docs });
}

// ── POST: upload a file, extract text, store ─────────────────
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRedisRateLimit(`kb_upload:${tenantId}`, MAX_UPLOADS_PER_DAY, 86400);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Daily upload limit reached. Try again tomorrow.' },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size <= 0) {
    return NextResponse.json({ error: `File "${file.name}" is empty (0 bytes).` }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'txt';

  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type ".${ext}". Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MD, CSV, JSON, JPG, PNG, WEBP, MP4, WebM.` },
      { status: 400 }
    );
  }

  const maxBytes = DOC_TYPES.has(ext)
    ? MAX_UPLOAD_BYTES_DOC
    : MEDIA_TYPES.has(ext)
      ? MAX_UPLOAD_BYTES_MEDIA
      : MAX_UPLOAD_BYTES_TEXT;

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${Math.floor(maxBytes / 1_000_000)} MB.` },
      { status: 413 }
    );
  }

  const isText = TEXT_TYPES.has(ext);
  let contentText = '';
  let fileUrl: string | null = null;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (!validateFileSignature(buffer, ext)) {
    return NextResponse.json(
      { error: `File content doesn't match its extension ".${ext}". The file may be corrupted or mislabeled.` },
      { status: 400 }
    );
  }

  const fileHash = computeSha256(buffer);
  const duplicate = await findDuplicateByHash(tenantId, fileHash);
  if (duplicate) {
    return NextResponse.json({ success: true, duplicate: true, existingDoc: duplicate });
  }

  // Sanitize storage path
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  const storagePath = `${tenantId}/${Date.now()}_${sanitized}`;
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('knowledge-docs')
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (!uploadErr) {
    fileUrl = storagePath;
  }

  if (isText) {
    const raw = buffer.toString('utf-8');
    contentText = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) + '\n...[truncated]' : raw;
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .insert({
      tenant_id: tenantId,
      filename: file.name,
      file_type: ext,
      content_text: contentText,
      file_url: fileUrl,
      file_hash: fileHash,
      processing_status: 'pending',
    })
    .select('id, filename, file_type, file_url, created_at, embedding, title, description, tags, category, processing_status')
    .single();

  if (error) {
    if (fileUrl) {
      await supabaseAdmin.storage.from('knowledge-docs').remove([fileUrl]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.id) {
    after(() => enqueueMediaAnalysis({
      docId:       data.id,
      storagePath: storagePath,
      bucket:      'knowledge-docs',
      mimeType:    file.type || 'application/octet-stream',
      fileType:    ext,
      filename:    file.name,
      contentText: contentText || undefined,
    }));
  }

  await invalidateTenantAllCaches(tenantId);

  return NextResponse.json({ success: true, data });
}

// ── DELETE: remove a doc by id ────────────────────────────────
export async function DELETE(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Get file_url to clean up storage if needed
  const { data: existing } = await supabaseAdmin
    .from('knowledge_docs')
    .select('file_url')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('knowledge_docs')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.file_url && !existing.file_url.startsWith('http')) {
    await supabaseAdmin.storage.from('knowledge-docs').remove([existing.file_url]);
  }

  await invalidateTenantAllCaches(tenantId);

  return NextResponse.json({ success: true });
}

// ── PATCH: owner edits to title/description/tags/category ────────────
// Marks the doc manually_edited=true so future re-analysis never
// overwrites what the owner explicitly set.
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const update: Record<string, unknown> = { manually_edited: true, updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') update.title = body.title.slice(0, 200);
  if (typeof body.description === 'string') update.description = body.description.slice(0, 2000);
  if (typeof body.category === 'string') update.category = body.category.slice(0, 60);
  if (Array.isArray(body.tags)) {
    update.tags = body.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 20);
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, filename, file_type, file_url, created_at, embedding, title, description, tags, category, processing_status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidateTenantAllCaches(tenantId);

  return NextResponse.json({ success: true, data });
}
