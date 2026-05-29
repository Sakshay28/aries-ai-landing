import { NextRequest, NextResponse } from 'next/server';
import { exchangeAndStoreSheets } from '@/lib/integrations/google-sheets';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL!;
  console.log('🔍 [GSHEETS CALLBACK] params:', { error, hasCode: !!code, hasState: !!state });

  if (error || !code || !state) {
    console.log('🔍 [GSHEETS CALLBACK] early exit — missing params or error from Google:', error);
    return NextResponse.redirect(`${base}/dashboard/integrations?error=google_sheets_denied`);
  }

  try {
    let parsedState: { tenantId: string; spreadsheetId: string };
    try {
      parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      console.log('🔍 [GSHEETS CALLBACK] parsed state:', parsedState);
    } catch (parseErr) {
      console.error('🔍 [GSHEETS CALLBACK] state parse error:', parseErr);
      throw new Error('Invalid state parameter');
    }

    const { tenantId, spreadsheetId } = parsedState;
    if (!tenantId) {
      console.error('🔍 [GSHEETS CALLBACK] no tenantId in state');
      throw new Error('No tenantId in state');
    }

    console.log('🔍 [GSHEETS CALLBACK] calling exchangeAndStoreSheets...');
    await exchangeAndStoreSheets(code, tenantId, spreadsheetId || '');
    console.log(`✅ [GSHEETS CALLBACK] SUCCESS — connected for tenant ${tenantId}`);
    return NextResponse.redirect(`${base}/dashboard/integrations?success=google_sheets`);
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown';
    console.error('❌ [GSHEETS CALLBACK] error:', msg);
    return NextResponse.redirect(`${base}/dashboard/integrations?error=google_sheets_failed&detail=${encodeURIComponent(msg)}`);
  }
}
