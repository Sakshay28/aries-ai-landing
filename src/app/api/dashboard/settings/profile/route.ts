import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

// ── GET: fetch business profile ───────────────────────────────
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('business_profiles')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return empty defaults if no profile created yet
  return NextResponse.json({
    success: true,
    data: data ?? {
      tenant_id: tenantId,
      company_name: '',
      industry: '',
      website_url: '',
      core_services: [],
      tone: 'friendly',
      contact_phone: '',
      contact_email: '',
    },
  });
}

// ── PUT: upsert business profile ──────────────────────────────
export async function PUT(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['company_name', 'industry', 'website_url', 'core_services', 'tone', 'contact_phone', 'contact_email'];
  const updates: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('business_profiles')
    .upsert(updates, { onConflict: 'tenant_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror key fields back to tenants table for compatibility with existing AI engine
  await supabaseAdmin.from('tenants').update({
    business_name: updates.company_name || undefined,
    business_type: updates.industry || undefined,
    business_website: updates.website_url || undefined,
    business_phone: updates.contact_phone || undefined,
    business_email: updates.contact_email || undefined,
  }).eq('id', tenantId);

  return NextResponse.json({ success: true, data });
}
