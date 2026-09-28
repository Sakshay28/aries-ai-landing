import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import crypto from 'crypto';

function getCanonicalAuthOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return req.nextUrl.origin;
  }
  if (host.endsWith('.vercel.app')) {
    return `https://${host}`;
  }
  return 'https://www.ariesai.in';
}

function getCookieDomain(req: NextRequest): string | undefined {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  if (host.includes('ariesai.in')) {
    return '.ariesai.in';
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const origin = getCanonicalAuthOrigin(req);
  const cookieDomain = getCookieDomain(req);
  const consentGiven = req.nextUrl.searchParams.get('consent') === '1';

  if (!env.GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID is not configured — cannot start Google sign-in');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const state = crypto.randomBytes(32).toString('hex');
  const rawNonce = crypto.randomBytes(32).toString('hex');
  const hashedNonce = crypto.createHash('sha256').update(rawNonce).digest('hex');

  const redirectUri = `${origin}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce: hashedNonce,
    prompt: 'select_account',
    access_type: 'offline',
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };

  response.cookies.set('google_oauth_state', state, cookieOptions);
  response.cookies.set('google_oauth_nonce', rawNonce, cookieOptions);

  if (consentGiven) {
    response.cookies.set('google_oauth_consent', '1', cookieOptions);
  }

  return response;
}
