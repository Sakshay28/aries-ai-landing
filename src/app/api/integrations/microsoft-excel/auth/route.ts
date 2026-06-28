import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getMicrosoftExcelAuthUrl } from '@/lib/integrations/microsoft-excel';

// GET /api/integrations/microsoft-excel/auth?spreadsheet_id=<id>
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Tenant passes their Microsoft Excel Workbook ID or URL at connect time
  const spreadsheetId = req.nextUrl.searchParams.get('spreadsheet_id') ?? '';

  // Encode both tenantId and spreadsheetId (workbookId) in state so callback can use them
  const state = Buffer.from(JSON.stringify({ tenantId, spreadsheetId })).toString('base64url');
  const url   = getMicrosoftExcelAuthUrl(state);
  return NextResponse.redirect(url);
}
