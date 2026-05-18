// ═══════════════════════════════════════════════════════════
// 🤖 Automation Flows API — Get / Update / Delete by ID
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// GET /api/dashboard/flows/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

// PUT /api/dashboard/flows/[id] — update nodes/edges/name/trigger/is_active
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Only allow safe fields
  const allowed: Record<string, unknown> = {};
  const fields = ['name', 'description', 'trigger_type', 'trigger_keywords', 'nodes', 'edges', 'is_active'];
  for (const f of fields) {
    if (f in body) allowed[f] = body[f];
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .update(allowed)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

// DELETE /api/dashboard/flows/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('automation_flows')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
