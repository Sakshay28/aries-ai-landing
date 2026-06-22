#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// One-time script: store per-tenant Meta Ads App credentials
//
//   node scripts/set-tenant-meta-app-creds.mjs <tenant_id> <app_id> <app_secret>
//
// Reads ENCRYPTION_KEY / ENCRYPTION_KEYS from .env.local.
// Encrypts the app_secret before writing to the tenants table.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const [,, tenantId, appId, appSecret] = process.argv;
if (!tenantId || !appId || !appSecret) {
  console.error('Usage: node scripts/set-tenant-meta-app-creds.mjs <tenant_id> <app_id> <app_secret>');
  process.exit(1);
}

// ─── Encrypt using the same keyManager logic ───────────────────────────────
function deriveKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest();
}

function encryptSecret(text) {
  let store, version;
  const keysRaw = env.ENCRYPTION_KEYS;
  if (keysRaw) {
    store = JSON.parse(keysRaw);
    version = env.CURRENT_ENCRYPTION_VERSION ?? 'v1';
  } else {
    const legacy = env.ENCRYPTION_KEY;
    if (!legacy || legacy.length < 16) throw new Error('No ENCRYPTION_KEY or ENCRYPTION_KEYS set in .env.local');
    store = { v1: legacy };
    version = 'v1';
  }
  const rawKey = store[version];
  if (!rawKey) throw new Error(`No key for version "${version}"`);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(rawKey), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `enc:${version}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// ─── Write to Supabase ─────────────────────────────────────────────────────
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const encryptedSecret = encryptSecret(appSecret);

const { error } = await sb
  .from('tenants')
  .update({ meta_ads_app_id: appId, meta_ads_app_secret: encryptedSecret })
  .eq('id', tenantId);

if (error) {
  console.error('❌ Failed to update tenant:', error.message);
  process.exit(1);
}

console.log(`✅ Meta Ads App credentials stored for tenant ${tenantId}`);
console.log(`   App ID: ${appId}`);
console.log(`   Secret: encrypted (${encryptedSecret.slice(0, 20)}...)`);
