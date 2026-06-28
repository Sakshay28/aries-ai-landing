import { NextRequest, NextResponse } from 'next/server';
import { exchangeAndStoreExcel } from '@/lib/integrations/microsoft-excel';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL!;
  console.log('🔍 [EXCEL CALLBACK] params:', { error, hasCode: !!code, hasState: !!state });

  if (error || !code || !state) {
    console.log('🔍 [EXCEL CALLBACK] early exit — missing params or error from Microsoft:', error);
    return NextResponse.redirect(`${base}/dashboard/integrations?error=microsoft_excel_denied`);
  }

  try {
    let parsedState: { tenantId: string; spreadsheetId: string };
    try {
      parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
      console.log('🔍 [EXCEL CALLBACK] parsed state:', parsedState);
    } catch (parseErr) {
      console.error('🔍 [EXCEL CALLBACK] state parse error:', parseErr);
      throw new Error('Invalid state parameter');
    }

    const { tenantId, spreadsheetId } = parsedState;
    if (!tenantId) {
      console.error('🔍 [EXCEL CALLBACK] no tenantId in state');
      throw new Error('No tenantId in state');
    }

    console.log('🔍 [EXCEL CALLBACK] calling exchangeAndStoreExcel...');
    await exchangeAndStoreExcel(code, tenantId, spreadsheetId || '');
    console.log(`✅ [EXCEL CALLBACK] SUCCESS — connected for tenant ${tenantId}`);
    return NextResponse.redirect(`${base}/dashboard/integrations?success=microsoft_excel`);
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown';
    console.error('❌ [EXCEL CALLBACK] error:', msg);
    return NextResponse.redirect(`${base}/dashboard/integrations?error=microsoft_excel_failed&detail=${encodeURIComponent(msg)}`);
  }
}
