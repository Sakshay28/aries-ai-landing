import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  // Set only when the signup page's consent checkbox was checked before the
  // "Continue with Google" click — the callback refuses to auto-provision a
  // brand-new tenant without it. Returning users (login) don't pass this and
  // don't need it, since no new tenant/consent record is created for them.
  const consentGiven = req.nextUrl.searchParams.get('consent') === '1';

  if (!env.GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID is not configured — cannot start Google sign-in');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const state = crypto.randomBytes(32).toString('hex');
  const rawNonce = crypto.randomBytes(32).toString('hex');
  const hashedNonce = crypto.createHash('sha256').update(rawNonce).digest('hex');

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce: hashedNonce,
    prompt: 'select_account',
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );

  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  response.cookies.set('google_oauth_nonce', rawNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  if (consentGiven) {
    response.cookies.set('google_oauth_consent', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
  }

  return response;
}
