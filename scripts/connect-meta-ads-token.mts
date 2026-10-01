/* eslint-disable @typescript-eslint/no-explicit-any -- ad-hoc Graph API JSON in a one-off ops script */
// Save a read-only Meta Ads token (ads_read) for a tenant so the daily report
// can show Ad Spend / ROAS / CPA (src/lib/reports/liveSources.ts).
//
//   npx tsx --tsconfig tsconfig.json scripts/connect-meta-ads-token.mts <tenant_id>
//
// Paste the token at the prompt (input is hidden). It is stored ENCRYPTED in
// tenants.meta_ads_token (migration 20261001b) — the WhatsApp token is never
// touched. Nothing is saved unless, with the new token:
//   1. Meta says it's valid and it has ads_read
//   2. it can see at least one ad account
//   3. it can read that account's insights (spend)

import fs from 'node:fs';
import readline from 'node:readline';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v); process.env[m[1]] = v; }
}

const { createClient } = await import('@supabase/supabase-js');
const { encryptTokenV2 } = await import('../src/lib/security/keyManager');

const GRAPH = 'https://graph.facebook.com/v22.0';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => { if (s.startsWith(question)) out.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

async function graph(p: string, token: string): Promise<{ ok: boolean; body: any }> {
  const sep = p.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${p}${sep}access_token=${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && !body.error, body };
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\nNothing was changed.`);
  process.exit(1);
}

const tenantId = process.argv[2];
if (!tenantId) fail('Usage: npx tsx --tsconfig tsconfig.json scripts/connect-meta-ads-token.mts <tenant_id>');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: tenant, error } = await sb.from('tenants').select('id, business_name').eq('id', tenantId).single();
if (error || !tenant) fail(`Tenant ${tenantId} not found`);
const col = await sb.from('tenants').select('meta_ads_token').eq('id', tenantId).single();
if (col.error) fail('Column tenants.meta_ads_token is missing — run supabase/migrations/20261001b_tenant_meta_ads_token.sql first.');
console.log(`Tenant: ${tenant.business_name}`);

const token = await promptHidden('Paste the Meta Ads token (hidden): ');
if (!token) fail('No token entered');

const dbg = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, token);
const data = dbg.body?.data;
if (!data?.is_valid) fail(`Meta says this token is not valid: ${JSON.stringify(dbg.body?.error || data?.error || {})}`);
const scopes: string[] = data.scopes || [];
if (!scopes.includes('ads_read') && !scopes.includes('ads_management')) {
  fail(`Token has no ads_read permission (it has: ${scopes.join(', ') || 'none'}). Regenerate it with ads_read ticked.`);
}
console.log(`✓ Valid (${scopes.join(', ')}); expires: ${data.expires_at ? new Date(data.expires_at * 1000).toISOString() : 'never'}`);

const accounts = await graph('me/adaccounts?fields=id,name,currency,timezone_name,account_status&limit=50', token);
if (!accounts.ok) fail(`Cannot list ad accounts: ${accounts.body?.error?.message}`);
const list: any[] = accounts.body.data || [];
if (list.length === 0) fail('Token sees no ad accounts. Give the system user access to the ad account (Assigned assets → Ad accounts).');
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const range = encodeURIComponent(JSON.stringify({ since: today, until: today }));
for (const a of list) {
  const ins = await graph(`${a.id}/insights?fields=spend&level=account&time_range=${range}`, token);
  if (!ins.ok) fail(`Cannot read insights for ${a.name} (${a.id}): ${ins.body?.error?.message}`);
  console.log(`✓ ${a.name} (${a.id}, ${a.currency}, ${a.timezone_name}) — spend today: ${ins.body.data?.[0]?.spend ?? '0'}`);
}

const enc = encryptTokenV2(token);
if (!enc) fail('Encryption failed');
const { error: upErr } = await sb.from('tenants').update({ meta_ads_token: enc }).eq('id', tenantId);
if (upErr) fail(`DB update failed: ${upErr.message}`);
console.log('\n✅ Saved. Ad Spend / ROAS / CPA will appear in the next report. The WhatsApp token was not changed.');
