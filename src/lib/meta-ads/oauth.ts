import { encryptToken, decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const META_OAUTH_BASE = 'https://www.facebook.com/v21.0/dialog/oauth';

const REQUIRED_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
  'instagram_basic',
  'leads_retrieval',
  'pages_manage_ads',
  'pages_manage_metadata',
];

// Per-tenant credentials take priority over global env vars.
// meta_ads_app_secret is stored encrypted in the tenants table.
async function getAppCredentials(tenantId?: string): Promise<{ appId: string; appSecret: string }> {
  if (tenantId) {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('meta_ads_app_id, meta_ads_app_secret')
      .eq('id', tenantId)
      .maybeSingle();
    if (data?.meta_ads_app_id && data?.meta_ads_app_secret) {
      const appSecret = decryptToken(data.meta_ads_app_secret);
      if (appSecret) return { appId: data.meta_ads_app_id, appSecret };
    }
  }
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('No Meta App credentials configured for this tenant. Set meta_ads_app_id and meta_ads_app_secret on the tenant, or set META_APP_ID and META_APP_SECRET env vars.');
  }
  return { appId, appSecret };
}

function getRedirectUri() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl}/api/meta-ads/callback`;
}

export async function buildOAuthUrl(state: string, tenantId: string): Promise<string> {
  const { appId } = await getAppCredentials(tenantId);
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getRedirectUri(),
    state,
    scope: REQUIRED_SCOPES.join(','),
    response_type: 'code',
    auth_type: 'rerequest',
  });
  return `${META_OAUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, tenantId: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const { appId, appSecret } = await getAppCredentials(tenantId);
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
    throw new Error(`Meta OAuth token exchange failed (${res.status}): ${err.slice(0, 300)}`);
  }

  return res.json();
}

export async function exchangeForLongLivedToken(shortLivedToken: string, tenantId: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const { appId, appSecret } = await getAppCredentials(tenantId);
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta long-lived token exchange failed (${res.status}): ${err.slice(0, 300)}`);
  }

  return res.json();
}

export async function refreshLongLivedToken(currentToken: string, tenantId: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  try {
    const { appId, appSecret } = await getAppCredentials(tenantId);
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    });

    const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchFacebookUser(accessToken: string): Promise<{
  id: string;
  name: string;
}> {
  const res = await fetch(`${META_GRAPH_BASE}/me?fields=id,name&access_token=${accessToken}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Facebook user: ${res.status}`);
  }
  return res.json();
}

export async function fetchBusinessAccounts(accessToken: string): Promise<{
  id: string;
  name: string;
}[]> {
  const res = await fetch(
    `${META_GRAPH_BASE}/me/businesses?fields=id,name&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function fetchAdAccounts(accessToken: string): Promise<{
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}[]> {
  const res = await fetch(
    `${META_GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status&limit=100&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function fetchPages(accessToken: string): Promise<{
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}[]> {
  const res = await fetch(
    `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function fetchWhatsAppBusinessAccounts(accessToken: string, businessId: string): Promise<{
  id: string;
  name: string;
  phone_numbers: { id: string; display_phone_number: string; verified_name: string; quality_rating: string }[];
}[]> {
  const wabaRes = await fetch(
    `${META_GRAPH_BASE}/${businessId}/owned_whatsapp_business_accounts?fields=id,name&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!wabaRes.ok) return [];
  const wabaData = await wabaRes.json();
  const wabas = wabaData.data || [];

  const results = [];
  for (const waba of wabas) {
    const phoneRes = await fetch(
      `${META_GRAPH_BASE}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const phoneData = phoneRes.ok ? await phoneRes.json() : { data: [] };
    results.push({
      id: waba.id,
      name: waba.name,
      phone_numbers: phoneData.data || [],
    });
  }
  return results;
}

export async function debugToken(accessToken: string, tenantId: string): Promise<{
  is_valid: boolean;
  scopes: string[];
  expires_at: number;
  error?: { message: string };
}> {
  const { appId, appSecret } = await getAppCredentials(tenantId);
  const res = await fetch(
    `${META_GRAPH_BASE}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    return { is_valid: false, scopes: [], expires_at: 0, error: { message: `HTTP ${res.status}` } };
  }
  const data = await res.json();
  return data.data || { is_valid: false, scopes: [], expires_at: 0 };
}

export function encryptAccessToken(token: string): string {
  const encrypted = encryptToken(token);
  if (!encrypted) throw new Error('Failed to encrypt access token');
  return encrypted;
}

export function decryptAccessToken(encrypted: string): string {
  const decrypted = decryptToken(encrypted);
  if (!decrypted) throw new Error('Failed to decrypt access token — check ENCRYPTION_KEY');
  return decrypted;
}

export async function validateTokenHealth(encryptedToken: string, tenantId: string): Promise<{
  valid: boolean;
  scopes: string[];
  expires_at: number | null;
  needs_refresh: boolean;
  error?: string;
}> {
  const token = decryptAccessToken(encryptedToken);
  const debug = await debugToken(token, tenantId);

  if (!debug.is_valid) {
    return {
      valid: false,
      scopes: [],
      expires_at: null,
      needs_refresh: false,
      error: debug.error?.message || 'Token is invalid',
    };
  }

  const expiresAt = debug.expires_at * 1000;
  const twoDaysFromNow = Date.now() + 2 * 24 * 60 * 60 * 1000;
  const needsRefresh = expiresAt > 0 && expiresAt < twoDaysFromNow;

  return {
    valid: true,
    scopes: debug.scopes,
    expires_at: expiresAt || null,
    needs_refresh: needsRefresh,
  };
}
