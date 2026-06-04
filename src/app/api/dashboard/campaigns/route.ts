// Tracking campaigns — create/list/delete "batches" (e.g. "4 June Tracking")
// so leads can be differentiated by where/when they came in.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

function slugify(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
}

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: campaigns, error }, { data: tenant }, { data: leadRows }] = await Promise.all([
    supabaseAdmin
      .from('lead_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('tenants').select('business_phone').eq('id', tenantId).single(),
    supabaseAdmin.from('leads').select('campaign_id').eq('tenant_id', tenantId).not('campaign_id', 'is', null),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tally lead counts per campaign.
  const counts: Record<string, number> = {};
  for (const row of leadRows || []) {
    const cid = (row as { campaign_id: string }).campaign_id;
    if (cid) counts[cid] = (counts[cid] || 0) + 1;
  }

  const waNumber = (tenant?.business_phone || '').replace(/\D/g, '');

  return NextResponse.json({
    success: true,
    campaigns: (campaigns || []).map(c => ({ ...c, lead_count: counts[c.id] || 0 })),
    wa_number: waNumber,
  });
}

export async function POST(req: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, ref_code, color, meta_ad_id } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const code = slugify(ref_code || name);
  if (!code) return NextResponse.json({ error: 'Could not derive a valid ref code' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('lead_campaigns')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      ref_code: code,
      color: color || '#7c3aed',
      meta_ad_id: (meta_ad_id || '').trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Ref code "${code}" is already used. Pick a different short code.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign: data });
}

export async function DELETE(req: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('lead_campaigns')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
