// Diagnostic endpoint — hit /api/dashboard/integrations/diag to see what's in DB
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { encryptToken } from '@/lib/utils/crypto';

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

// POST /api/dashboard/integrations/diag
// Manually write a google_sheets row (bypasses OAuth) to test the display
export async function POST() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let encryptErr: string | null = null;
  let encryptedToken: string | null = null;
  try {
    encryptedToken = encryptToken('dummy_token_for_diag') as string;
  } catch (e) {
    encryptErr = (e as Error).message;
  }

  const now = new Date().toISOString();
  const config = {
    access_token:   encryptedToken ?? 'raw_dummy',
    refresh_token:  encryptedToken ?? 'raw_dummy',
    expires_at:     Date.now() + 3600 * 1000,
    spreadsheet_id: 'DIAG_PLACEHOLDER',
    sheet_name:     'Leads',
  };

  const { error } = await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      { tenant_id: tenantId, integration_id: 'google_sheets', config, is_active: true, connected_at: now, updated_at: now },
      { onConflict: 'tenant_id,integration_id' }
    );

  return NextResponse.json({
    tenantId,
    encryptErr,
    upsertError: error?.message ?? null,
    success: !error,
    message: error ? 'FAILED' : 'Row written — go check Integrations page now',
  });
}
