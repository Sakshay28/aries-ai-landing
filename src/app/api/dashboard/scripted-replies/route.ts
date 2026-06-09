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

  const { data, error } = await supabaseAdmin
    .from('scripted_replies')
    .select('id, keywords, reply, media_url, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const keywords: string[] = (body?.keywords ?? [])
    .map((k: string) => k.trim().toLowerCase())
    .filter(Boolean);
  const reply: string = (body?.reply ?? '').trim();
  const mediaUrl: string | null = (body?.media_url ?? '').trim() || null;

  if (keywords.length === 0) return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
  if (!reply && !mediaUrl) return NextResponse.json({ error: 'Reply text or image is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('scripted_replies')
    .insert({ tenant_id: tenantId, keywords, reply: reply || '', media_url: mediaUrl, is_active: true })
    .select('id, keywords, reply, media_url, is_active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
