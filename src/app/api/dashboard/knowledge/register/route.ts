import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueMediaAnalysis } from '@/lib/ai/media-queue';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { computeSha256, validateFileSignature, findDuplicateByHash } from '@/lib/utils/media-validation';

export const maxDuration = 60; // clamped to 10s on Hobby — see MediaAnalysisWorkerService for the retry story on files whose analysis exceeds that

const TEXT_TYPES = new Set(['txt', 'md', 'csv', 'json', 'html', 'xml']);
const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
};

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.storagePath || !body?.filename || !body?.ext) {
    return NextResponse.json({ error: 'storagePath, filename, and ext are required' }, { status: 400 });
  }

  const { storagePath, filename, ext } = body;
  const isText = TEXT_TYPES.has(ext);
  const needsAnalysis = !isText; // pdf + image + video all go through async analysis

  // The file is already in storage (uploaded via the presigned URL before this
  // call). Download it once here to validate its signature and hash it for
  // duplicate detection. PDF/image/video text extraction happens later,
  // asynchronously, in enqueueMediaAnalysis — not here — so a large file's
  // Gemini call can't approach this request's own timeout.
  let fileHash: string | null = null;

  if (!isText) {
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from('knowledge-docs')
      .download(storagePath);

    if (dlErr || !fileData) {
      return NextResponse.json({ error: dlErr?.message || 'Failed to read uploaded file' }, { status: 500 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    if (!validateFileSignature(buffer, ext)) {
      await supabaseAdmin.storage.from('knowledge-docs').remove([storagePath]);
      return NextResponse.json(
        { error: `File content doesn't match its extension ".${ext}". The file may be corrupted or mislabeled.` },
        { status: 400 }
      );
    }

    fileHash = computeSha256(buffer);
    const duplicate = await findDuplicateByHash(tenantId, fileHash);
    if (duplicate) {
      await supabaseAdmin.storage.from('knowledge-docs').remove([storagePath]);
      return NextResponse.json({ success: true, duplicate: true, existingDoc: duplicate });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .insert({
      tenant_id: tenantId,
      filename,
      file_type: ext,
      content_text: '',
      file_url: storagePath,
      file_hash: fileHash,
      processing_status: needsAnalysis ? 'pending' : 'ready',
    })
    .select('id, filename, file_type, file_url, created_at, embedding, title, description, tags, category, processing_status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // after() guarantees this keeps running past the response being sent —
  // a plain fire-and-forget call has no such guarantee on Vercel.
  if (data?.id && needsAnalysis) {
    after(() => enqueueMediaAnalysis({
      docId:    data.id,
      storagePath,
      bucket:   'knowledge-docs',
      mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
      fileType: ext,
      filename,
    }));
  }

  await invalidateTenantAllCaches(tenantId);

  return NextResponse.json({ success: true, data });
}
