import { NextRequest, NextResponse } from 'next/server';
import { exchangeAndStoreSheets } from '@/lib/integrations/google-sheets';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !code || !state) {
    return NextResponse.redirect(`${base}/dashboard/integrations?error=google_sheets_denied`);
  }

  try {
    const { tenantId, spreadsheetId } = JSON.parse(
      Buffer.from(state, 'base64url').toString('utf-8')
    ) as { tenantId: string; spreadsheetId: string };

    if (!tenantId) throw new Error('No tenantId in state');

    await exchangeAndStoreSheets(code, tenantId, spreadsheetId || '');
    console.log(`✅ Google Sheets connected for tenant ${tenantId}`);
    return NextResponse.redirect(`${base}/dashboard/integrations?success=google_sheets`);
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown';
    console.error('Google Sheets callback error:', msg);
    return NextResponse.redirect(`${base}/dashboard/integrations?error=google_sheets_failed&detail=${encodeURIComponent(msg)}`);
  }
}
