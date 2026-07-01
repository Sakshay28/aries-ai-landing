// ═══════════════════════════════════════════════════════════
// 📝 Scripted Replies API — PATCH (update) + DELETE
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
  if (Array.isArray(body.keywords)) {
    updates.keywords = body.keywords.map((k: string) => k.trim().toLowerCase()).filter(Boolean);
  }
  if (typeof body.reply === 'string') {
    updates.reply = body.reply.trim();
  }
  if ('media_urls' in body && Array.isArray(body.media_urls)) {
    const urls = body.media_urls.map((u: string) => u.trim()).filter(Boolean);
    updates.media_urls = urls;
    updates.media_url = urls[0] || null;
  } else if ('media_url' in body) {
    const url = (body.media_url ?? '').trim() || null;
    updates.media_url = url;
    updates.media_urls = url ? [url] : [];
  }

  let { data, error } = await supabaseAdmin
    .from('scripted_replies')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, keywords, reply, media_url, media_urls, is_active')
    .single();

  if (error && /column|does not exist/i.test(error.message || '')) {
    const fallbackUpdates = { ...updates };
    delete fallbackUpdates.media_urls;
    ({ data, error } = await supabaseAdmin
      .from('scripted_replies')
      .update(fallbackUpdates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id, keywords, reply, media_url, is_active')
      .single());
  }

  if (error || !data) return NextResponse.json({ error: error?.message || 'Failed to update scripted reply' }, { status: 500 });

  const result = {
    ...data,
    media_urls: data.media_urls ?? (data.media_url ? [data.media_url] : [])
  };

  return NextResponse.json({ data: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('scripted_replies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId); // tenant isolation

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
