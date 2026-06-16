// ═══════════════════════════════════════════════════════════
// 📲 WhatsApp Embedded Signup — OAuth Callback (Redirect URI)
// ═══════════════════════════════════════════════════════════
// This is the URL registered as the Redirect URI on the Meta-hosted
// Embedded Signup configuration. Meta sends the client here after
// signup with ?code=...&state=...
//
//   1. Resolve the tenant (signed state, else logged-in session)
//   2. Exchange code → access token
//   3. Resolve WABA + phone number
//   4. Subscribe our app to the WABA (so inbound msgs hit the webhook)
//   5. Persist encrypted token + phone_number_id + waba_id on tenant
//   6. Redirect back to the dashboard
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { encryptToken } from '@/lib/utils/crypto';
import { logAudit } from '@/lib/audit/logger';
import {
  exchangeEmbeddedSignupCode,
  resolveWaba,
  subscribeAppToWaba,
  assertCloudApiToken,
} from '@/lib/whatsapp/embedded-signup';

function dashboardRedirect(req: NextRequest, params: Record<string, string>): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const url = new URL('/dashboard/settings', appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}

type WaMode = 'cloud_api' | 'coexistence';

// Verify the signed state set by /start. Returns { tenantId, mode } only if the
// HMAC matches the cookie-stored value (CSRF + tamper protection).
// Accepts the current 4-segment state (tenantId:nonce:mode:sig) and the legacy
// 3-segment state (tenantId:nonce:sig — implied mode cloud_api) for any flow
// that was in flight across the deploy.
async function tenantFromSignedState(
  returnedState: string | null
): Promise<{ tenantId: string; mode: WaMode } | null> {
  if (!returnedState) return null;

  const cookieStore = await cookies();
  const storedState = cookieStore.get('wa_es_state')?.value;
  cookieStore.delete('wa_es_state');

  if (!storedState || storedState !== returnedState) return null;

  const parts = returnedState.split(':');
  let tenantId: string;
  let nonce: string;
  let mode: WaMode;
  let signature: string;

  if (parts.length === 4) {
    [tenantId, nonce, , signature] = parts;
    mode = parts[2] === 'coexistence' ? 'coexistence' : 'cloud_api';
  } else if (parts.length === 3) {
    [tenantId, nonce, signature] = parts;
    mode = 'cloud_api';
  } else {
    return null;
  }

  const signedPayload = parts.length === 4
    ? `${tenantId}:${nonce}:${parts[2]}`
    : `${tenantId}:${nonce}`;

  const secret = process.env.META_APP_SECRET || process.env.ENCRYPTION_KEY || 'fallback';
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  if (
    signature.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    return null;
  }
  return { tenantId, mode };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  // Client denied / Meta error
  if (error) {
    return dashboardRedirect(req, { wa_error: errorReason || error });
  }
  if (!code) {
    return dashboardRedirect(req, { wa_error: 'missing_code' });
  }

  // ── 1. Resolve tenant: signed state first, then session ──
  // Signed state covers the self-launched flow (/start). Session covers the
  // Meta-hosted generated link clicked from the dashboard (cookie rides the
  // top-level redirect back to our own domain). State, when present, must be
  // valid — a tampered/mismatched state is rejected rather than silently
  // falling through to the session.
  let tenantId: string | null;
  let mode: WaMode = 'cloud_api';
  if (returnedState) {
    const verified = await tenantFromSignedState(returnedState);
    if (!verified) return dashboardRedirect(req, { wa_error: 'invalid_state' });
    tenantId = verified.tenantId;
    mode = verified.mode;
  } else {
    // Meta-hosted generated-link flow carries no state — defaults to Cloud API.
    tenantId = await getTenantId();
  }
  if (!tenantId) {
    return dashboardRedirect(req, { wa_error: 'no_tenant' });
  }

  try {
    // ── 2. Exchange code → token ──
    const tokenRes = await exchangeEmbeddedSignupCode(code);
    const token = tokenRes.access_token;
    assertCloudApiToken(token);

    // ── 3. Resolve WABA + phone number ──
    const { wabaId, phoneNumberId, displayPhoneNumber, verifiedName } = await resolveWaba(token);

    // ── 4. Subscribe our app to the WABA (inbound webhook delivery) ──
    await subscribeAppToWaba(token, wabaId);

    // ── 5. Persist encrypted credentials on the tenant ──
    // These columns are what sendWhatsAppMessage() and the webhook read.
    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        wa_access_token: encryptToken(token),
        wa_phone_number_id: phoneNumberId,
        wa_waba_id: wabaId,
        wa_mode: mode,
        // Anchor coexistence onboarding so the dashboard can show the history
        // sync as "syncing" until the `history` webhook chunks finish arriving.
        ...(mode === 'coexistence' && { coexistence_connected_at: new Date().toISOString() }),
      })
      .eq('id', tenantId);

    if (updateErr) {
      console.error('[es] Failed to persist WhatsApp credentials:', updateErr);
      return dashboardRedirect(req, { wa_error: 'persist_failed' });
    }

    logAudit({
      tenant_id: tenantId,
      action: 'api_token_updated',
      entity: 'tenant',
      entity_id: tenantId,
      new_value: {
        source: 'embedded_signup',
        wa_mode: mode,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber,
        verified_name: verifiedName,
      },
    });

    return dashboardRedirect(req, { wa_connected: '1' });
  } catch (err) {
    console.error('[es] Embedded Signup callback error:', err);
    return dashboardRedirect(req, {
      wa_error: err instanceof Error ? err.message.slice(0, 120) : 'callback_failed',
    });
  }
}
