import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { storeDocEmbedding } from '@/lib/ai/rag';

const TEXT_TYPES = new Set(['txt', 'md', 'csv', 'json', 'html', 'xml']);
const MAX_BYTES = 500_000; // 500 KB text cap before truncation

// ── GET: list all knowledge docs for the tenant ──────────────
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('knowledge_docs')
    .select('id, filename, file_type, file_url, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [] });
}

// ── POST: upload a file, extract text, store ─────────────────
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'txt';
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
    const { data: urlData } = supabaseAdmin.storage
      .from('knowledge-docs')
      .getPublicUrl(storagePath);
    fileUrl = urlData?.publicUrl ?? null;
  }

  // ── Extract text for supported types ────────────────────
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
    })
    .select('id, filename, file_type, file_url, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate + store embedding asynchronously (non-blocking — don't fail upload if this errors)
  if (data?.id && contentText) {
    storeDocEmbedding(data.id, contentText).catch(
      e => console.error('knowledge: embedding generation failed for', data.id, e)
    );
  }

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
  return NextResponse.json({ success: true });
}
