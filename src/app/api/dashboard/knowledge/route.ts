import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueEmbedding } from '@/lib/ai/embedding-queue';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { getAI } from '@/lib/ai/client';

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
    .select('id, filename, file_type, file_url, created_at, embedding')
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

  let contentText = '';
  let fileUrl: string | null = null;

  // ── Upload raw file to Supabase Storage ──────────────────
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

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

  // ── Extract text for supported types (skip media — no text to extract) ──
  if (isMedia) {
    // Videos/images have no extractable text — stored as sendable media only
  } else if (isText) {
    const raw = buffer.toString('utf-8');
    contentText = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) + '\n...[truncated]' : raw;
  } else if (ext === 'pdf') {
    try {
      const genAIResponse = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
          'Extract all text content from this document exactly as it is written. Do not summarize, do not translate, do not add any comments. Just return the raw extracted text.',
        ],
      });
      contentText = genAIResponse.text || '';
    } catch (err) {
      console.error('Failed to extract text from PDF using Gemini:', err);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .insert({
      tenant_id: tenantId,
      filename: file.name,
      file_type: ext,
      content_text: contentText,
      file_url: fileUrl,
    })
    .select('id, filename, file_type, file_url, created_at, embedding')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate + store embedding asynchronously (non-blocking — don't fail upload if this errors)
  if (data?.id && contentText) {
    enqueueEmbedding({ docId: data.id, contentText });
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
