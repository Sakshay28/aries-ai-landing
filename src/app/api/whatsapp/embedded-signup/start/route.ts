// ═══════════════════════════════════════════════════════════
// 📲 WhatsApp Embedded Signup — Initiate (self-launched flow)
// ═══════════════════════════════════════════════════════════
// Alternative to Meta's hosted generated link: launches the OAuth
// dialog ourselves with a signed `state` so the callback can map the
// result back to the right tenant (and reject CSRF). Returns the URL
// for the client to open (e.g. a "Connect WhatsApp" button).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getTenantId } from '@/lib/auth/getTenantId';
import { buildEmbeddedSignupUrl } from '@/lib/whatsapp/embedded-signup';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ?mode=coexistence onboards a WhatsApp Business app number (owner keeps the
    // app on their phone). Anything else is the standard Cloud-API onboarding.
    const mode = req.nextUrl.searchParams.get('mode') === 'coexistence'
      ? 'coexistence'
      : 'cloud_api';

    const nonce = crypto.randomBytes(16).toString('hex');
    // Bind the mode INTO the signed state so the callback can trust it (it
    // decides wa_mode). state = tenantId:nonce:mode → signed with a 4th segment.
    const state = `${tenantId}:${nonce}:${mode}`;

    // Sign the state so the callback can verify it wasn't tampered with.
    const secret = process.env.META_APP_SECRET || process.env.ENCRYPTION_KEY || 'fallback';
    const signature = crypto.createHmac('sha256', secret).update(state).digest('hex');
    const signedState = `${state}:${signature}`;

    const cookieStore = await cookies();
    cookieStore.set('wa_es_state', signedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    const url = buildEmbeddedSignupUrl(signedState, { coexistence: mode === 'coexistence' });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start Embedded Signup';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
