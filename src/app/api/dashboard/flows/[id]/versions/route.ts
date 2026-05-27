// ═══════════════════════════════════════════════════════════
// 📜 Flow Versions API
// ═══════════════════════════════════════════════════════════
// GET  /api/dashboard/flows/[id]/versions   — list all versions
// POST /api/dashboard/flows/[id]/versions   — snapshot current flow
// PUT  /api/dashboard/flows/[id]/versions   — restore a version
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/logger';

// GET — list versions for a flow
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: flowId } = await params;
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { data, error } = await supabaseAdmin
    .from('flow_versions')
    .select('id, version, created_at, published_by, label')
    .eq('tenant_id', tenantId)
    .eq('flow_id', flowId)
    .order('version', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

// POST — create a new snapshot (called on publish)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: flowId } = await params;
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json().catch(() => ({}));
  const { label } = body;

  // Fetch current flow
  const { data: flow, error: flowErr } = await supabaseAdmin
    .from('automation_flows')
    .select('nodes, edges, name')
    .eq('id', flowId)
    .eq('tenant_id', tenantId)
    .single();

  if (flowErr || !flow) {
    return NextResponse.json({ success: false, error: 'Flow not found' }, { status: 404 });
  }

  // Get latest version number
  const { data: latest } = await supabaseAdmin
    .from('flow_versions')
    .select('version')
    .eq('flow_id', flowId)
    .eq('tenant_id', tenantId)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = ((latest?.[0]?.version as number) ?? 0) + 1;

  const { data: version, error: insertErr } = await supabaseAdmin
    .from('flow_versions')
    .insert({
      tenant_id: tenantId,
      flow_id: flowId,
      version: nextVersion,
      label: label ?? `v${nextVersion}`,
      snapshot_json: JSON.stringify({ nodes: flow.nodes, edges: flow.edges }),
      created_at: new Date().toISOString(),
    })
    .select('id, version, created_at')
    .single();

  if (insertErr) return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });

  logAudit({ tenant_id: tenantId, action: 'flow_published', entity: 'flow', entity_id: flowId, new_value: { version: nextVersion } });

  return NextResponse.json({ success: true, data: version });
}

// PUT — restore a specific version
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: flowId } = await params;
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { versionId } = await req.json().catch(() => ({}));
  if (!versionId) return NextResponse.json({ success: false, error: 'versionId required' }, { status: 400 });

  const { data: ver, error: verErr } = await supabaseAdmin
    .from('flow_versions')
    .select('snapshot_json, version')
    .eq('id', versionId)
    .eq('tenant_id', tenantId)
    .single();

  if (verErr || !ver) return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 });

  let snapshot: { nodes: unknown; edges: unknown };
  try {
    snapshot = JSON.parse(ver.snapshot_json as string);
  } catch {
    return NextResponse.json({ success: false, error: 'Corrupt snapshot' }, { status: 500 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('automation_flows')
    .update({ nodes: snapshot.nodes, edges: snapshot.edges, updated_at: new Date().toISOString() })
    .eq('id', flowId)
    .eq('tenant_id', tenantId);

  if (updateErr) return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });

  logAudit({ tenant_id: tenantId, action: 'flow_restored', entity: 'flow', entity_id: flowId, new_value: { restored_from_version: ver.version } });

  return NextResponse.json({ success: true, message: `Flow restored to v${ver.version}` });
}
