import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueEmbedding } from '@/lib/ai/embedding-queue';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';
import { getAI } from '@/lib/ai/client';

const PDF_EXTRACT_MAX_BYTES = 5_000_000; // only extract text from PDFs under 5 MB

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.storagePath || !body?.filename || !body?.ext) {
    return NextResponse.json({ error: 'storagePath, filename, and ext are required' }, { status: 400 });
  }

  const { storagePath, filename, ext } = body;

  let contentText = '';

  // For PDFs: download from storage and extract text via Gemini
  if (ext === 'pdf') {
    try {
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from('knowledge-docs')
        .download(storagePath);

      if (!dlErr && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        if (buffer.length <= PDF_EXTRACT_MAX_BYTES) {
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
        }
      }
    } catch (err) {
      console.error('Failed to extract text from PDF:', err);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .insert({
      tenant_id: tenantId,
      filename,
      file_type: ext,
      content_text: contentText,
      file_url: storagePath,
    })
    .select('id, filename, file_type, file_url, created_at, embedding')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data?.id && contentText) {
    enqueueEmbedding({ docId: data.id, contentText });
  }

  await invalidateTenantAllCaches(tenantId);

  return NextResponse.json({ success: true, data });
}
