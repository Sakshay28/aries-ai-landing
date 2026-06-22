// ═══════════════════════════════════════════════════════════
// 🔌 Meta Ads OAuth — Callback
// ═══════════════════════════════════════════════════════════
// 1. Verify signed state (CSRF protection)
// 2. Exchange code → short-lived → long-lived token
// 3. Fetch FB user + business manager
// 4. Encrypt + persist connection
// 5. Auto-discover ad accounts, pages, WhatsApp numbers
// 6. Redirect back to settings UI
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchFacebookUser,
  fetchBusinessAccounts,
  encryptAccessToken,
  debugToken,
} from '@/lib/meta-ads/oauth';
import { syncMetaAssets } from '@/lib/meta-ads/sync';
import { logAudit } from '@/lib/audit/logger';

function settingsRedirect(req: NextRequest, params: Record<string, string>): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const url = new URL('/dashboard/meta-ads/settings', appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  // User denied / Meta error
  if (error) {
    return settingsRedirect(req, { meta_error: errorReason || error });
  }

  if (!code || !returnedState) {
    return settingsRedirect(req, { meta_error: 'missing_code' });
  }

  // ── 1. Verify state (CSRF) ──
  const cookieStore = await cookies();
  const storedState = cookieStore.get('meta_oauth_state')?.value;
  cookieStore.delete('meta_oauth_state');

  if (!storedState || storedState !== returnedState) {
    return settingsRedirect(req, { meta_error: 'invalid_state' });
  }

  const parts = returnedState.split(':');
  if (parts.length !== 3) {
    return settingsRedirect(req, { meta_error: 'malformed_state' });
  }
  const [tenantId, nonce, signature] = parts;
  const secret = process.env.META_APP_SECRET || process.env.ENCRYPTION_KEY || 'fallback';
  const expectedSig = crypto.createHmac('sha256', secret).update(`${tenantId}:${nonce}`).digest('hex');
  if (
    signature.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    return settingsRedirect(req, { meta_error: 'state_signature_mismatch' });
  }

  try {
    // ── 2. Exchange code → tokens ──
    const shortLived = await exchangeCodeForToken(code, tenantId);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token, tenantId);
    const token = longLived.access_token;

    // ── 3. Fetch FB user + business + scopes ──
    const fbUser = await fetchFacebookUser(token);
    const businesses = await fetchBusinessAccounts(token);
    const primaryBusiness = businesses[0] || null;
    const tokenInfo = await debugToken(token, tenantId);

    const expiresAt =
      longLived.expires_in && longLived.expires_in > 0
        ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
        : tokenInfo.expires_at
          ? new Date(tokenInfo.expires_at * 1000).toISOString()
          : null;

    // ── 4. Persist connection (encrypted) ──
    const encryptedToken = encryptAccessToken(token);

    const { data: connection, error: upsertError } = await supabaseAdmin
      .from('meta_connections')
      .upsert(
        {
          tenant_id: tenantId,
          fb_user_id: fbUser.id,
          fb_user_name: fbUser.name,
          business_id: primaryBusiness?.id ?? null,
          business_name: primaryBusiness?.name ?? null,
          access_token: encryptedToken,
          token_expires_at: expiresAt,
          scopes: tokenInfo.scopes || [],
          status: 'connected',
          last_refreshed_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      )
      .select('id')
      .single();

    if (upsertError || !connection) {
      console.error('Failed to persist Meta connection:', upsertError);
      return settingsRedirect(req, { meta_error: 'persist_failed' });
    }

    // ── 5. Auto-discover assets (ad accounts, pages, WA numbers) ──
    await syncMetaAssets(tenantId, connection.id, token, primaryBusiness?.id ?? null).catch((e) => {
      console.warn('Asset sync after connect failed (non-fatal):', e);
    });

    logAudit({
      tenant_id: tenantId,
      action: 'webhook_configured',
      entity: 'meta_connection',
      entity_id: connection.id,
      new_value: { fb_user: fbUser.name, business: primaryBusiness?.name },
    });

    return settingsRedirect(req, { meta_connected: '1' });
  } catch (err) {
    console.error('Meta OAuth callback error:', err);
    return settingsRedirect(req, {
      meta_error: err instanceof Error ? err.message.slice(0, 100) : 'callback_failed',
    });
  }
}
