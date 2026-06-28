import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

// GET: Fetch list of worksheets (tabs) from Google Sheets API
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: integration, error: intError } = await supabaseAdmin
      .from('tenant_integrations')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'google_sheets')
      .maybeSingle();

    if (intError) throw intError;
    if (!integration) return NextResponse.json({ error: 'Google Sheets not connected' }, { status: 404 });

    const cfg = integration.config as any;
    const spreadsheetId = cfg.spreadsheet_id;
    const accessToken = decryptToken(cfg.access_token);

    if (!spreadsheetId || !accessToken) {
      return NextResponse.json({ error: 'Google Sheets integration configuration missing parameters' }, { status: 400 });
    }

    // Call Google Sheets API to fetch sheets
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error('❌ [GSHEETS settings GET] Google API failed:', errText);
      return NextResponse.json({ error: `Failed to fetch sheets from Google: ${errText}` }, { status: metaRes.status });
    }

    const meta = await metaRes.json() as any;
    const tabs = meta.sheets?.map((s: any) => s.properties?.title) || [];

    return NextResponse.json({ worksheets: tabs });
  } catch (err: any) {
    console.error('❌ [GSHEETS settings GET] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Save selected worksheet and column mappings
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { sheetName, columnMappings } = body;

    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName is required' }, { status: 400 });
    }

    // Fetch existing config
    const { data: integration, error: intError } = await supabaseAdmin
      .from('tenant_integrations')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'google_sheets')
      .maybeSingle();

    if (intError) throw intError;
    if (!integration) return NextResponse.json({ error: 'Google Sheets not connected' }, { status: 404 });

    const existingCfg = integration.config as any;
    
    // Update config
    const updatedCfg = {
      ...existingCfg,
      sheet_name: sheetName,
      column_mappings: columnMappings || existingCfg.column_mappings || {},
    };

    const { error: updateError } = await supabaseAdmin
      .from('tenant_integrations')
      .update({
        config: updatedCfg,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'google_sheets');

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (err: any) {
    console.error('❌ [GSHEETS settings POST] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
