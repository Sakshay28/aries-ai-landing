// ═══════════════════════════════════════════════════════════
// 🔌 Meta Ads OAuth — Initiate Connection
// ═══════════════════════════════════════════════════════════
// Generates a signed `state` (tenant + nonce) and redirects the
// user to Meta's OAuth dialog. State is stored in an httpOnly
// cookie and verified on callback to prevent CSRF.
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { requireConnect, errorResponse } from '@/lib/meta-ads/guard';
import { buildOAuthUrl } from '@/lib/meta-ads/oauth';

export async function GET() {
  try {
    const guard = await requireConnect();
    if (!guard.ok) return guard.response;

    const nonce = crypto.randomBytes(16).toString('hex');
    const state = `${guard.tenantId}:${nonce}`;

    // Sign the state so the callback can verify it wasn't tampered with.
    const secret = process.env.META_APP_SECRET || process.env.ENCRYPTION_KEY || 'fallback';
    const signature = crypto.createHmac('sha256', secret).update(state).digest('hex');
    const signedState = `${state}:${signature}`;

    const cookieStore = await cookies();
    cookieStore.set('meta_oauth_state', signedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    const url = buildOAuthUrl(signedState);
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
