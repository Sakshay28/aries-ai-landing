import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

type Params = { params: Promise<{ id: string }> };

// PUT — full update
export async function PUT(req: NextRequest, { params }: Params) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { name, trigger_source, ai_summary, status } = await req.json();

  const allowed: Record<string, string> = {};
  if (name !== undefined) allowed.name = String(name).trim();
  if (trigger_source !== undefined) allowed.trigger_source = String(trigger_source).trim();
  if (ai_summary !== undefined) allowed.ai_summary = String(ai_summary).trim();
  if (status !== undefined) allowed.status = String(status);

  const { data, error } = await supabaseAdmin
    .from('smart_rules')
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ rule: data });
}

// PATCH — toggle status only (pause/resume)
export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();
  if (!['active', 'paused', 'learning'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('smart_rules')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: Params) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('smart_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
