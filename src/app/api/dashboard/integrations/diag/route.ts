// Diagnostic endpoint — hit /api/dashboard/integrations/diag to see what's in DB
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();

  // What does this tenant have?
  const { data: forTenant, error: e1 } = await supabaseAdmin
    .from('tenant_integrations')
    .select('integration_id, tenant_id, is_active, connected_at')
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000');

  // What google_sheets rows exist across all tenants?
  const { data: allSheets, error: e2 } = await supabaseAdmin
    .from('tenant_integrations')
    .select('integration_id, tenant_id, is_active, connected_at')
    .eq('integration_id', 'google_sheets');

  // Try a test upsert to see if writes work at all
  const { error: writeError } = await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      { tenant_id: tenantId ?? '', integration_id: 'diag_test', config: { test: '1' }, is_active: true },
      { onConflict: 'tenant_id,integration_id' }
    );

  // Clean up
  if (!writeError) {
    await supabaseAdmin.from('tenant_integrations').delete()
      .eq('tenant_id', tenantId ?? '').eq('integration_id', 'diag_test');
  }

  return NextResponse.json({
    tenantId,
    forTenant: forTenant ?? null,
    forTenantError: e1?.message ?? null,
    allGoogleSheetsRows: allSheets ?? null,
    allGoogleSheetsError: e2?.message ?? null,
    testUpsertError: writeError?.message ?? null,
    testUpsertWorked: !writeError,
  });
}
