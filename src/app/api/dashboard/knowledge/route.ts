import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueEmbedding } from '@/lib/ai/embedding-queue';
import { enqueueMediaAnalysis } from '@/lib/ai/media-queue';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { computeSha256, validateFileSignature, findDuplicateByHash } from '@/lib/utils/media-validation';

export const maxDuration = 60; // clamped to 10s on Hobby — see MediaAnalysisWorkerService for the retry story on files whose analysis exceeds that

const TEXT_TYPES = new Set(['txt', 'md', 'csv', 'json', 'html', 'xml']);
const MEDIA_TYPES = new Set(['mp4', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_EXTS = new Set([...TEXT_TYPES, 'pdf', ...MEDIA_TYPES]);
const MAX_BYTES = 500_000;          // 500 KB text cap before truncation
const MAX_UPLOAD_BYTES_TEXT = 5_000_000;  // 5 MB for text/PDF
const MAX_UPLOAD_BYTES_MEDIA = 16_000_000; // 16 MB for video/images (WhatsApp limit)
const MAX_UPLOADS_PER_DAY = 20;     // per-tenant upload cap (Gemini cost abuse guard)

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

  // Per-tenant upload rate limit — caps Gemini PDF-extraction cost abuse.
  const rl = await checkRedisRateLimit(`kb_upload:${tenantId}`, MAX_UPLOADS_PER_DAY, 86400);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Daily knowledge upload limit reached. Try again tomorrow.' },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'txt';

  // Reject unsupported types up front (only text formats + pdf are processed).
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type ".${ext}". Allowed: ${[...ALLOWED_EXTS].join(', ')}.` },
      { status: 400 }
    );
  }

  const isMedia = MEDIA_TYPES.has(ext);
  const maxBytes = isMedia ? MAX_UPLOAD_BYTES_MEDIA : MAX_UPLOAD_BYTES_TEXT;

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${Math.floor(maxBytes / 1_000_000)} MB.` },
      { status: 413 }
    );
  }

  const isText = TEXT_TYPES.has(ext);
  const isPdf = ext === 'pdf';

  let contentText = '';
  let fileUrl: string | null = null;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // ── Reject files whose bytes don't match their claimed type ───────
  // (Stand-in for AV scanning — these are owner-only uploads to their own
  // private tenant bucket, not public user-generated content, so we
  // validate structure rather than run a full virus scan.)
  if (!validateFileSignature(buffer, ext)) {
    return NextResponse.json(
      { error: `File content doesn't match its extension ".${ext}". The file may be corrupted or mislabeled.` },
      { status: 400 }
    );
  }

  // ── Soft duplicate check — warn, don't block ───────────────────────
  const fileHash = computeSha256(buffer);
  const duplicate = await findDuplicateByHash(tenantId, fileHash);
  if (duplicate) {
    return NextResponse.json({ success: true, duplicate: true, existingDoc: duplicate });
  }

  // ── Upload raw file to Supabase Storage ──────────────────
  const storagePath = `${tenantId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const { error: uploadErr } = await supabaseAdmin.storage
    .from('knowledge-docs')
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (!uploadErr) {
    // Store the storage path, not a permanent public URL.
    // Knowledge docs may contain proprietary content (menus, SOPs, pricing).
    // Public URLs are guessable from the path pattern; signed URLs (generated
    // on read with a 1-hour expiry) require server-side generation and are
    // not accessible to unauthenticated parties. The GET handler now generates
    // signed URLs on each listing request so the dashboard can display/download files.
    fileUrl = storagePath;
  }

  // ── Extract text for plain text types now (cheap, synchronous). PDFs go ──
  // through async analysis (enqueueMediaAnalysis) instead of extracting here
  // — a large PDF's Gemini call could otherwise approach this request's
  // own timeout before the row is even inserted.
  if (isText) {
    const raw = buffer.toString('utf-8');
    contentText = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) + '\n...[truncated]' : raw;
  }

  // Media and PDFs go through async AI analysis (vision/video/tagging) before
  // they're searchable — start as 'pending' so the UI can show a processing state.
  const needsAnalysis = isMedia || isPdf;

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .insert({
      tenant_id: tenantId,
      filename: file.name,
      file_type: ext,
      content_text: contentText,
      file_url: fileUrl,
      file_hash: fileHash,
      processing_status: needsAnalysis ? 'pending' : 'ready',
    })
    .select('id, filename, file_type, file_url, created_at, embedding, title, description, tags, category, processing_status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // after() guarantees this keeps running past the response being sent —
  // a plain fire-and-forget call has no such guarantee on Vercel.
  if (data?.id) {
    if (needsAnalysis) {
      after(() => enqueueMediaAnalysis({
        docId:       data.id,
        storagePath: storagePath,
        bucket:      'knowledge-docs',
        mimeType:    file.type || 'application/octet-stream',
        fileType:    ext,
        filename:    file.name,
      }));
    } else if (contentText) {
      after(() => enqueueEmbedding({ docId: data.id, contentText }));
    }
  }

  // Flush all tenant caches so the next AI request immediately uses the new document
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

  const { error } = await supabaseAdmin
    .from('knowledge_docs')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flush all tenant caches so the next AI request won't use stale RAG results
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
