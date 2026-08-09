// Shiprocket integration service facade — connection lifecycle + token
// management. Mirrors src/lib/shopify/service.ts's role, with one addition
// Shopify doesn't need: Shiprocket's JWT expires (~10 days per docs) and
// must be refreshed, whereas a Shopify Custom App token never expires.
//
// getValidShiprocketToken() is the ONLY function that reads
// shiprocket_connections.auth_token_enc — everything else (routes, the AI
// tool, the webhook dispatcher) goes through it or through
// shiprocketClientForTenant(), mirroring how shopifyClientForTenant() is
// documented as "the ONLY module that reads credentials from a tenant".

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptTokenV2, decryptTokenV2 } from '@/lib/security/keyManager';
import { ShiprocketClient, ShiprocketApiError, type PickupLocation } from './client';

// [UNVERIFIED exact TTL] — Shiprocket's docs describe the login JWT as valid
// for ~10 days. Refresh a day early so no in-flight request races an
// expiring token. Correct this constant once a real login response confirms
// the actual value.
const SHIPROCKET_TOKEN_TTL_DAYS = 10;
const REFRESH_BUFFER_DAYS = 1;

export interface ConnectInput {
  tenantId: string;
  email: string;
  password: string; // plaintext — encrypted before storing
}

export interface StatusSummary {
  connected: boolean;
  email: string | null;
  status: 'disconnected' | 'connected' | 'error';
  last_auth_error: string | null;
  connected_at: string | null;
  last_token_refresh_at: string | null;
  default_pickup_location: string | null;
  default_item_weight_kg: number | null;
  default_package_length_cm: number | null;
  default_package_breadth_cm: number | null;
  default_package_height_cm: number | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  counts: Record<string, number>;
  pending_jobs: number;
  failed_jobs: number;
}

interface ConnectionRow {
  tenant_id: string;
  email: string;
  password_enc: string;
  auth_token_enc: string | null;
  token_expires_at: string | null;
  webhook_secret_enc: string;
  default_pickup_location: string | null;
  default_item_weight_kg: number;
  default_package_length_cm: number;
  default_package_breadth_cm: number;
  default_package_height_cm: number;
  status: 'disconnected' | 'connected' | 'error';
  last_auth_error: string | null;
}

async function getConnectionRow(tenantId: string): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin.from('shiprocket_connections').select('*').eq('tenant_id', tenantId).maybeSingle();
  return (data as ConnectionRow) || null;
}

// ─── Token lifecycle ────────────────────────────────────────
/**
 * Reuse the stored JWT if it's still valid (with a 1-day refresh buffer);
 * otherwise re-authenticate with the stored (encrypted) password. Returns
 * null — never throws — if there's no connection or login fails; callers
 * surface `status`/`last_auth_error` from getStatus() to the UI instead of
 * propagating a raw exception.
 */
export async function getValidShiprocketToken(tenantId: string): Promise<string | null> {
  const row = await getConnectionRow(tenantId);
  if (!row) return null;

  if (row.auth_token_enc && row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at).getTime();
    const bufferMs = REFRESH_BUFFER_DAYS * 24 * 60 * 60 * 1000;
    if (expiresAt - bufferMs > Date.now()) {
      const token = decryptTokenV2(row.auth_token_enc);
      if (token) return token;
    }
  }

  const password = decryptTokenV2(row.password_enc);
  if (!password) {
    await supabaseAdmin.from('shiprocket_connections').update({
      status: 'error', last_auth_error: 'stored password could not be decrypted', updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId);
    return null;
  }

  try {
    const { token } = await ShiprocketClient.login(row.email, password);
    const encToken = encryptTokenV2(token);
    const expiresAt = new Date(Date.now() + SHIPROCKET_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin.from('shiprocket_connections').update({
      auth_token_enc: encToken,
      token_expires_at: expiresAt,
      last_token_refresh_at: new Date().toISOString(),
      status: 'connected',
      last_auth_error: null,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId);
    return token;
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    await supabaseAdmin.from('shiprocket_connections').update({
      status: 'error', last_auth_error: message, updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId);
    return null;
  }
}

export function shiprocketClientForTenant(token: string): ShiprocketClient {
  return new ShiprocketClient({ token });
}

// ─── Connect / disconnect / test ────────────────────────────
export async function connectTenant(input: ConnectInput): Promise<{ ok: true; pickupLocations: PickupLocation[] } | { ok: false; error: string }> {
  let token: string;
  try {
    ({ token } = await ShiprocketClient.login(input.email, input.password));
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return { ok: false, error: message };
  }

  const encPassword = encryptTokenV2(input.password);
  const encToken = encryptTokenV2(token);
  if (!encPassword || !encToken) return { ok: false, error: 'encryption failed' };

  const existing = await getConnectionRow(input.tenantId);
  const webhookSecretEnc = existing?.webhook_secret_enc || encryptTokenV2(crypto.randomBytes(24).toString('hex'));
  if (!webhookSecretEnc) return { ok: false, error: 'encryption failed' };

  const expiresAt = new Date(Date.now() + SHIPROCKET_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin.from('shiprocket_connections').upsert({
    tenant_id: input.tenantId,
    email: input.email,
    password_enc: encPassword,
    auth_token_enc: encToken,
    token_expires_at: expiresAt,
    webhook_secret_enc: webhookSecretEnc,
    status: 'connected',
    last_auth_error: null,
    connected_at: existing?.status === 'connected' ? undefined : nowIso,
    last_token_refresh_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: 'tenant_id' });

  if (error) return { ok: false, error: error.message };

  let pickupLocations: PickupLocation[] = [];
  try {
    const client = shiprocketClientForTenant(token);
    pickupLocations = await client.listPickupLocations();
    if (pickupLocations.length === 1) {
      await supabaseAdmin.from('shiprocket_connections')
        .update({ default_pickup_location: pickupLocations[0].pickup_location })
        .eq('tenant_id', input.tenantId);
    }
  } catch (err) {
    // Non-fatal — connection is still valid, the dashboard can show a "select
    // pickup location" state and the merchant can retry fetching the list.
    console.error('[shiprocket:connect] listPickupLocations failed', (err as Error).message);
  }

  return { ok: true, pickupLocations };
}

export async function testConnection(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidShiprocketToken(tenantId);
  if (!token) {
    const row = await getConnectionRow(tenantId);
    return { ok: false, error: row?.last_auth_error || 'Not connected' };
  }
  try {
    await shiprocketClientForTenant(token).listPickupLocations();
    return { ok: true };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return { ok: false, error: message };
  }
}

export async function disconnectTenant(tenantId: string): Promise<void> {
  await supabaseAdmin.from('shiprocket_connections').delete().eq('tenant_id', tenantId);
  await supabaseAdmin.from('shiprocket_sync_jobs').update({
    status: 'cancelled', completed_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('status', 'pending');
}

export async function setPickupLocation(tenantId: string, pickupLocation: string): Promise<void> {
  await supabaseAdmin.from('shiprocket_connections').update({
    default_pickup_location: pickupLocation, updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId);
}

export async function setDefaults(tenantId: string, defaults: {
  default_item_weight_kg?: number;
  default_package_length_cm?: number;
  default_package_breadth_cm?: number;
  default_package_height_cm?: number;
}): Promise<void> {
  await supabaseAdmin.from('shiprocket_connections').update({
    ...defaults, updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId);
}

// ─── Status summary ─────────────────────────────────────────
export async function getStatus(tenantId: string): Promise<StatusSummary> {
  const [row, ...countRows] = await Promise.all([
    getConnectionRow(tenantId),
    countShipmentsByStatus(tenantId),
    countJobs(tenantId, 'pending'),
    countJobs(tenantId, 'failed'),
  ]);
  const [counts, pending, failed] = countRows as [Record<string, number>, number, number];

  const publicBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const webhookSecret = row?.webhook_secret_enc ? decryptTokenV2(row.webhook_secret_enc) : null;

  return {
    connected: row?.status === 'connected',
    email: row?.email || null,
    status: row?.status || 'disconnected',
    last_auth_error: row?.last_auth_error || null,
    connected_at: (row as unknown as { connected_at?: string })?.connected_at || null,
    last_token_refresh_at: (row as unknown as { last_token_refresh_at?: string })?.last_token_refresh_at || null,
    default_pickup_location: row?.default_pickup_location || null,
    default_item_weight_kg: row?.default_item_weight_kg ?? null,
    default_package_length_cm: row?.default_package_length_cm ?? null,
    default_package_breadth_cm: row?.default_package_breadth_cm ?? null,
    default_package_height_cm: row?.default_package_height_cm ?? null,
    webhook_url: publicBase && row ? `${publicBase}/api/webhooks/shiprocket/${tenantId}` : null,
    webhook_secret: webhookSecret,
    counts,
    pending_jobs: pending,
    failed_jobs: failed,
  };
}

async function countShipmentsByStatus(tenantId: string): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin.from('shiprocket_shipments').select('status').eq('tenant_id', tenantId);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const status = (row as { status: string }).status;
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

async function countJobs(tenantId: string, status: string): Promise<number> {
  const { count } = await supabaseAdmin.from('shiprocket_sync_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', status);
  return count || 0;
}
