// ═══════════════════════════════════════════════════════════
// 🤖 Automation Flows API — List & Create
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// GET /api/dashboard/flows — list all flows for tenant
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .select('id, name, description, trigger_type, trigger_keywords, is_active, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST /api/dashboard/flows — create new flow
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name = 'Untitled Flow', description = '', trigger_type = 'keyword', trigger_keywords = [], nodes = [], edges = [] } = body;

  const { data, error } = await supabaseAdmin
    .from('automation_flows')
    .insert({ tenant_id: tenantId, name, description, trigger_type, trigger_keywords, nodes, edges, is_active: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data }, { status: 201 });
}
