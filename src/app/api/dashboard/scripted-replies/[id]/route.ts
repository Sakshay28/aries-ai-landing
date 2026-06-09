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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
  if (Array.isArray(body.keywords)) {
    updates.keywords = body.keywords.map((k: string) => k.trim().toLowerCase()).filter(Boolean);
  }
  if (typeof body.reply === 'string') {
    updates.reply = body.reply.trim();
  }
  if ('media_url' in body) {
    updates.media_url = (body.media_url ?? '').trim() || null;
  }

  const { data, error } = await supabaseAdmin
    .from('scripted_replies')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId) // tenant isolation
    .select('id, keywords, reply, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
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
