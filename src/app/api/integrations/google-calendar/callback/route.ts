import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeAndStore } from '@/lib/integrations/google-calendar';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code     = searchParams.get('code');
  const tenantId = searchParams.get('state');
  const error    = searchParams.get('error');

  if (error || !code || !tenantId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?error=google_calendar_denied`
    );
  }

  try {
    await exchangeCodeAndStore(code, tenantId);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?success=google_calendar`
    );
  } catch (e) {
    console.error('Google Calendar callback error:', e);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?error=google_calendar_failed`
    );
  }
}
