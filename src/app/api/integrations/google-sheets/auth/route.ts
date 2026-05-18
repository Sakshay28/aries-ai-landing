import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getGoogleSheetsAuthUrl } from '@/lib/integrations/google-sheets';

// GET /api/integrations/google-sheets/auth?spreadsheet_id=<id>
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Tenant passes their Google Sheet ID (from the URL) at connect time
  const spreadsheetId = req.nextUrl.searchParams.get('spreadsheet_id') ?? '';

  // Encode both tenantId and spreadsheetId in state so callback can use them
  const state = Buffer.from(JSON.stringify({ tenantId, spreadsheetId })).toString('base64url');
  const url   = getGoogleSheetsAuthUrl(state);
  return NextResponse.redirect(url);
}
