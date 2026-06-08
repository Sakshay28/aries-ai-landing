import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const state = crypto.randomBytes(32).toString('hex');
  const rawNonce = crypto.randomBytes(32).toString('hex');
  const hashedNonce = crypto.createHash('sha256').update(rawNonce).digest('hex');

  const params = new URLSearchParams({
    client_id: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
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

  return response;
}
