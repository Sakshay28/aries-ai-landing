import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// GET — list all rules for tenant
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('smart_rules')
    .select('id, name, trigger_source, ai_summary, status, customers_reached, actions_taken, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data || [] });
}

// POST — create new rule
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, trigger_source, ai_summary, status } = await req.json();
  if (!name?.trim() || !trigger_source?.trim() || !ai_summary?.trim()) {
    return NextResponse.json({ error: 'name, trigger_source and ai_summary are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('smart_rules')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      trigger_source: trigger_source.trim(),
      ai_summary: ai_summary.trim(),
      status: status || 'active',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data }, { status: 201 });
}
