// ═══════════════════════════════════════════════════════════
// 📝 Scripted Replies API — GET (list) + POST (create)
// ═══════════════════════════════════════════════════════════
// Scripted replies bypass the AI entirely: when a customer's
// message matches any of the configured keywords, the exact
// reply text is sent verbatim — no tokens consumed, guaranteed
// wording every time. Optionally includes an image (sent with
// the reply text as caption).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let data: any[] | null = null;
  let { data: initialData, error } = await supabaseAdmin
    .from('scripted_replies')
    .select('id, keywords, reply, media_url, media_urls, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  data = initialData;

  if (error && /column|does not exist/i.test(error.message || '')) {
    const { data: fallbackData, error: fallbackError } = await supabaseAdmin
      .from('scripted_replies')
      .select('id, keywords, reply, media_url, is_active, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    data = fallbackData;
    error = fallbackError;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped = (data ?? []).map(row => ({
    ...row,
    media_urls: row.media_urls ?? (row.media_url ? [row.media_url] : [])
  }));

  return NextResponse.json({ data: mapped });
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const keywords: string[] = (body?.keywords ?? [])
    .map((k: string) => k.trim().toLowerCase())
    .filter(Boolean);
  const reply: string = (body?.reply ?? '').trim();
  
  let mediaUrls: string[] = [];
  if (Array.isArray(body?.media_urls)) {
    mediaUrls = body.media_urls.map((u: string) => u.trim()).filter(Boolean);
  } else if (body?.media_url) {
    mediaUrls = [body.media_url.trim()];
  }
  const mediaUrl = mediaUrls[0] || null;

  if (keywords.length === 0) return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
  if (!reply && mediaUrls.length === 0) return NextResponse.json({ error: 'Reply text or attachment is required' }, { status: 400 });

  const insertPayload: any = {
    tenant_id: tenantId,
    keywords,
    reply: reply || '',
    media_url: mediaUrl,
    media_urls: mediaUrls,
    is_active: true
  };

  let { data, error } = await supabaseAdmin
    .from('scripted_replies')
    .insert(insertPayload)
    .select('id, keywords, reply, media_url, media_urls, is_active, created_at')
    .single();

  if (error && /column|does not exist/i.test(error.message || '')) {
    delete insertPayload.media_urls;
    ({ data, error } = await supabaseAdmin
      .from('scripted_replies')
      .insert(insertPayload)
      .select('id, keywords, reply, media_url, is_active, created_at')
      .single());
  }

  if (error || !data) return NextResponse.json({ error: error?.message || 'Failed to create scripted reply' }, { status: 500 });

  const result = {
    ...data,
    media_urls: data.media_urls ?? (data.media_url ? [data.media_url] : [])
  };

  return NextResponse.json({ data: result });
}

