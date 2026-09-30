import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueMediaAnalysis } from '@/lib/ai/media-queue';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { computeSha256, validateFileSignature, findDuplicateByHash } from '@/lib/utils/media-validation';

export const maxDuration = 60; // clamped to 10s on Hobby — see MediaAnalysisWorkerService for the retry story on files whose analysis exceeds that

const MIME_BY_EXT: Record<string, string> = {
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

  const body = await req.json().catch(() => null);
  if (!body?.storagePath || !body?.filename || !body?.ext) {
    return NextResponse.json({ error: 'storagePath, filename, and ext are required' }, { status: 400 });
  }

  const { storagePath, filename, ext } = body;
  const normExt = ext.toLowerCase().trim();

  // Multi-tenant security: Ensure storagePath starts with authenticated tenantId
  if (!storagePath.startsWith(`${tenantId}/`)) {
    return NextResponse.json({ error: 'Forbidden: invalid storage path' }, { status: 403 });
  }

  // Download uploaded file to validate signature, check duplicates, and extract initial text
  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from('knowledge-docs')
    .download(storagePath);

  if (dlErr || !fileData) {
    return NextResponse.json({ error: dlErr?.message || 'Failed to read uploaded file' }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  if (buffer.length === 0) {
    await supabaseAdmin.storage.from('knowledge-docs').remove([storagePath]);
    return NextResponse.json({ error: `File "${filename}" is empty (0 bytes).` }, { status: 400 });
  }

  if (!validateFileSignature(buffer, normExt)) {
    await supabaseAdmin.storage.from('knowledge-docs').remove([storagePath]);
    return NextResponse.json(
      { error: `File content doesn't match its extension ".${normExt}". The file may be corrupted or mislabeled.` },
      { status: 400 }
    );
  }

  const fileHash = computeSha256(buffer);
  const duplicate = await findDuplicateByHash(tenantId, fileHash);
  if (duplicate) {
    await supabaseAdmin.storage.from('knowledge-docs').remove([storagePath]);
    return NextResponse.json({ success: true, duplicate: true, existingDoc: duplicate });
  }

  // Extract initial text synchronously for plain text formats so it's instantly available
  let contentText = '';
  if (['txt', 'md', 'json', 'csv', 'html', 'xml'].includes(normExt)) {
    contentText = buffer.toString('utf-8').slice(0, 500_000);
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .insert({
      tenant_id: tenantId,
      filename,
      file_type: normExt,
      content_text: contentText,
      file_url: storagePath,
      file_hash: fileHash,
      processing_status: 'pending',
    })
    .select('id, filename, file_type, file_url, created_at, embedding, title, description, tags, category, processing_status')
    .single();

  if (error) {
    // Rollback storage upload if DB insert fails
    await supabaseAdmin.storage.from('knowledge-docs').remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.id) {
    after(() => enqueueMediaAnalysis({
      docId:       data.id,
      storagePath,
      bucket:      'knowledge-docs',
      mimeType:    MIME_BY_EXT[normExt] || 'application/octet-stream',
      fileType:    normExt,
      filename,
      contentText: contentText || undefined,
    }));
  }

  await invalidateTenantAllCaches(tenantId);

  return NextResponse.json({ success: true, data });
}
