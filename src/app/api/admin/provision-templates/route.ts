// POST /api/admin/provision-templates  — trigger template registration for a tenant
// GET  /api/admin/provision-templates?tenant_id=X — fetch current template statuses
//
// Template registration is a ONE-TIME onboarding step, not a cron job.
// The cron only uses already-approved templates; this endpoint is the only
// place that creates them.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { ensureRequiredTemplates } from '@/lib/whatsapp/templateProvisioner';

const PLATFORM_EVENT_TYPES = ['staff_keepalive', 'human_assistance'] as const;

const forbidden = () => NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

async function getTemplateStatuses(tenantId: string) {
  const { data } = await supabaseAdmin
    .from('draft_templates')
    .select('event_type, status, meta_template_id, updated_at')
    .eq('tenant_id', tenantId)
    .in('event_type', PLATFORM_EVENT_TYPES);

  const map: Record<string, { status: string; meta_template_id: string | null; updated_at: string }> = {};
  for (const row of data ?? []) {
    if (row.event_type) map[row.event_type] = { status: row.status, meta_template_id: row.meta_template_id, updated_at: row.updated_at };
  }
  return map;
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const body = await req.json().catch(() => null);
  const tenantId = body?.tenant_id;
  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json({ success: false, error: 'tenant_id required' }, { status: 400 });
  }

  // Clear any FAILED rows first so provisioning can retry after a WABA gets verified
  if (body?.force_retry) {
    await supabaseAdmin
      .from('draft_templates')
      .delete()
      .eq('tenant_id', tenantId)
      .in('event_type', PLATFORM_EVENT_TYPES)
      .eq('status', 'FAILED');
  }

  await ensureRequiredTemplates(tenantId);

  return NextResponse.json({ success: true, templates: await getTemplateStatuses(tenantId) });
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const tenantId = req.nextUrl.searchParams.get('tenant_id');
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenant_id required' }, { status: 400 });
  }

  return NextResponse.json({ success: true, templates: await getTemplateStatuses(tenantId) });
}
