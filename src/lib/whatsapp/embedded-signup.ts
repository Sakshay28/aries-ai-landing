// ═══════════════════════════════════════════════════════════
// 📲 WhatsApp Embedded Signup (Meta-hosted Tech Provider flow)
// ═══════════════════════════════════════════════════════════
// Onboards a client's WhatsApp Business Account (WABA) onto Aries
// AI without manual copy-paste of phone_number_id / token.
//
// Flow (Meta-hosted redirect variant):
//   1. Client opens the Embedded Signup link (Meta-hosted) or the
//      OAuth dialog built by buildEmbeddedSignupUrl().
//   2. Client completes signup on Meta's pages.
//   3. Meta redirects to our Redirect URI with ?code=...&state=...
//   4. /api/whatsapp/embedded-signup/callback exchanges the code,
//      resolves the WABA + phone number, subscribes our app to the
//      WABA, and stores the (encrypted) credentials on the tenant.
//
// Requires the app to be an approved Tech Provider (Advanced Access
// to whatsapp_business_management + whatsapp_business_messaging).
// ═══════════════════════════════════════════════════════════

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const META_OAUTH_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth';

function getAppCredentials() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured');
  }
  return { appId, appSecret };
}

// The Embedded Signup configuration created in the Meta App Dashboard
// (WhatsApp → Use cases → Customize → "Create a new config").
//
// Coexistence may use a DEDICATED config (one whose feature is "WhatsApp
// Business app onboarding"). If META_WA_ES_COEX_CONFIG_ID is set we use it for
// the coexistence flow; otherwise we fall back to the standard config and let
// the `extras.featureType` parameter switch the flow (see buildEmbeddedSignupUrl).
function getConfigId(coexistence = false): string {
  const coexConfigId = process.env.META_WA_ES_COEX_CONFIG_ID;
  if (coexistence && coexConfigId) return coexConfigId;

  const configId = process.env.META_WA_ES_CONFIG_ID;
  if (!configId) {
    throw new Error('META_WA_ES_CONFIG_ID must be set to the Embedded Signup configuration ID');
  }
  return configId;
}

// MUST match, byte-for-byte, the Redirect URI registered on the ES config
// in the Meta App Dashboard. Meta rejects token exchange on any mismatch.
export function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl}/api/whatsapp/embedded-signup/callback`;
}

// Build the OAuth dialog URL for the self-launched flow (alternative to the
// Meta-hosted generated link). Carries our signed `state` for tenant
// correlation + CSRF protection.
//
// When opts.coexistence is set, the flow onboards a WhatsApp *Business app*
// number (Coexistence): the number stays on the owner's phone AND mirrors to
// the Cloud API. Meta drives this via `extras.featureType =
// whatsapp_business_app_onboarding` (the older "coexistence" value is
// deprecated). sessionInfoVersion 3 is required for the Business-app flow.
export function buildEmbeddedSignupUrl(
  state: string,
  opts: { coexistence?: boolean } = {}
): string {
  const { appId } = getAppCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    config_id: getConfigId(opts.coexistence),
    redirect_uri: getRedirectUri(),
    state,
    response_type: 'code',
    override_default_response_type: 'true',
  });
  if (opts.coexistence) {
    params.set(
      'extras',
      JSON.stringify({
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      })
    );
  }
  return `${META_OAUTH_DIALOG}?${params.toString()}`;
}

// ── Exchange the redirect `code` for an access token ──
// The Meta-hosted (redirect) variant requires redirect_uri in the exchange,
// unlike the self-hosted JS-SDK variant.
export async function exchangeEmbeddedSignupCode(code: string): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  const { appId, appSecret } = getAppCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: getRedirectUri(),
    code,
  });

  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ES token exchange failed (${res.status}): ${err.slice(0, 300)}`);
  }
  return res.json();
}

export interface ResolvedWaba {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

// ── Resolve the WABA + phone number from the granted token ──
// Primary path: debug_token → granular_scopes → whatsapp_business_management
// target_ids (this is what Meta populates for an Embedded Signup grant).
// Fallback: traverse owned WhatsApp business accounts via the business node.
export async function resolveWaba(accessToken: string): Promise<ResolvedWaba> {
  const wabaId = await resolveWabaId(accessToken);
  if (!wabaId) {
    throw new Error('No WhatsApp Business Account found on the granted token');
  }

  const phoneRes = await fetch(
    `${META_GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!phoneRes.ok) {
    const err = await phoneRes.text();
    throw new Error(`Failed to fetch phone numbers for WABA ${wabaId} (${phoneRes.status}): ${err.slice(0, 200)}`);
  }
  const phoneData = await phoneRes.json();
  const numbers: Array<{ id: string; display_phone_number?: string; verified_name?: string }> =
    phoneData.data || [];

  if (numbers.length === 0) {
    throw new Error(`WABA ${wabaId} has no phone numbers yet`);
  }
  if (numbers.length > 1) {
    console.warn(`[es] WABA ${wabaId} has ${numbers.length} phone numbers — using the first (${numbers[0].id})`);
  }

  const first = numbers[0];
  return {
    wabaId,
    phoneNumberId: first.id,
    displayPhoneNumber: first.display_phone_number ?? null,
    verifiedName: first.verified_name ?? null,
  };
}

async function resolveWabaId(accessToken: string): Promise<string | null> {
  const { appId, appSecret } = getAppCredentials();

  // ── Primary: granular_scopes from debug_token ──
  try {
    const dbgRes = await fetch(
      `${META_GRAPH_BASE}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (dbgRes.ok) {
      const dbg = await dbgRes.json();
      const granular: Array<{ scope: string; target_ids?: string[] }> =
        dbg?.data?.granular_scopes || [];
      const waScope = granular.find((g) => g.scope === 'whatsapp_business_management');
      const targetId = waScope?.target_ids?.[0];
      if (targetId) return targetId;
    }
  } catch (e) {
    console.warn('[es] debug_token granular_scopes lookup failed, falling back:', e);
  }

  // ── Fallback: traverse businesses → owned WABAs ──
  try {
    const bizRes = await fetch(
      `${META_GRAPH_BASE}/me/businesses?fields=id&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!bizRes.ok) return null;
    const bizData = await bizRes.json();
    for (const biz of bizData.data || []) {
      const wabaRes = await fetch(
        `${META_GRAPH_BASE}/${biz.id}/owned_whatsapp_business_accounts?fields=id&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!wabaRes.ok) continue;
      const wabaData = await wabaRes.json();
      const firstWaba = (wabaData.data || [])[0];
      if (firstWaba?.id) return firstWaba.id;
    }
  } catch (e) {
    console.warn('[es] businesses → WABA fallback failed:', e);
  }

  return null;
}

// ── Subscribe OUR app to the WABA so inbound messages hit our webhook ──
// Without this, the client's messages never reach /api/webhooks/whatsapp.
export async function subscribeAppToWaba(accessToken: string, wabaId: string): Promise<void> {
  const res = await fetch(`${META_GRAPH_BASE}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to subscribe app to WABA ${wabaId} (${res.status}): ${err.slice(0, 200)}`);
  }
}

// ── Validate the token shape before we persist it ──
// Mirrors the guard in src/lib/meta/service.ts headers(): Cloud API tokens
// start with "EAA". Catching it here gives a clean onboarding error instead
// of a 401 the first time we try to send.
export function assertCloudApiToken(token: string): void {
  if (!/^EAA[A-Za-z0-9]/.test(token)) {
    const preview = token ? `${token.slice(0, 8)}…(${token.length} chars)` : 'empty';
    throw new Error(`Granted token is not a Cloud API token (expected EAA…, got ${preview})`);
  }
}
