/* eslint-disable @typescript-eslint/no-explicit-any -- ad-hoc Graph API JSON in a one-off ops script */
// Swap a tenant's WhatsApp system-user token for one that ALSO has ads_read,
// so the daily report can read ad spend (src/lib/reports/liveSources.ts).
//
//   npx tsx --tsconfig tsconfig.json scripts/connect-meta-ads-token.mts <tenant_id>
//
// Paste the new token at the prompt (input is hidden). Nothing is saved
// unless ALL of these pass with the NEW token:
//   1. it has whatsapp_business_messaging, whatsapp_business_management, ads_read
//   2. it can still see the tenant's WhatsApp phone number (sending keeps working)
//   3. it can see at least one ad account and read its insights
// The previous token's ciphertext is written to scratch/ first so the swap can
// be rolled back by hand.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v); process.env[m[1]] = v; }
}

const { createClient } = await import('@supabase/supabase-js');
const { encryptTokenV2 } = await import('../src/lib/security/keyManager');

const GRAPH = 'https://graph.facebook.com/v22.0';
const REQUIRED = ['whatsapp_business_messaging', 'whatsapp_business_management', 'ads_read'];

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
const { data: tenant, error } = await sb.from('tenants')
  .select('id, business_name, wa_phone_number_id, wa_access_token').eq('id', tenantId).single();
if (error || !tenant) fail(`Tenant ${tenantId} not found`);
console.log(`Tenant: ${tenant.business_name} (phone_number_id ${tenant.wa_phone_number_id})`);

const token = await promptHidden('Paste the new system-user token (hidden): ');
if (!token) fail('No token entered');

// 1. scopes
const dbg = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, token);
const data = dbg.body?.data;
if (!data?.is_valid) fail(`Meta says this token is not valid: ${JSON.stringify(dbg.body?.error || data?.error || {})}`);
const scopes: string[] = data.scopes || [];
const missing = REQUIRED.filter((s) => !scopes.includes(s));
if (missing.length) fail(`Token is missing permission(s): ${missing.join(', ')}. Regenerate it with ${REQUIRED.join(', ')} ticked.`);
console.log(`✓ Permissions OK (${scopes.join(', ')}); expires: ${data.expires_at ? new Date(data.expires_at * 1000).toISOString() : 'never'}`);

// 2. WhatsApp still works
const phone = await graph(`${tenant.wa_phone_number_id}?fields=display_phone_number,verified_name`, token);
if (!phone.ok) fail(`New token cannot see the WhatsApp number — WhatsApp would break: ${phone.body?.error?.message}`);
console.log(`✓ WhatsApp number visible: ${phone.body.display_phone_number} (${phone.body.verified_name})`);

// 3. Ads readable
const accounts = await graph('me/adaccounts?fields=id,name,currency,timezone_name,account_status&limit=50', token);
if (!accounts.ok) fail(`Cannot list ad accounts: ${accounts.body?.error?.message}`);
const list: any[] = accounts.body.data || [];
if (list.length === 0) fail('Token sees no ad accounts. In Business Settings → System users → Assign assets, give this system user the ad account.');
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const range = encodeURIComponent(JSON.stringify({ since: today, until: today }));
for (const a of list) {
  const ins = await graph(`${a.id}/insights?fields=spend&level=account&time_range=${range}`, token);
  if (!ins.ok) fail(`Cannot read insights for ${a.name} (${a.id}): ${ins.body?.error?.message}`);
  console.log(`✓ Ad account ${a.name} (${a.id}, ${a.currency}, ${a.timezone_name}) — spend today: ${ins.body.data?.[0]?.spend ?? '0'}`);
}

// Save (with backup)
const backupDir = path.join(process.cwd(), 'scratch');
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `wa-token-backup-${tenantId}-${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify({ tenant_id: tenantId, wa_access_token: tenant.wa_access_token }, null, 1));
const enc = encryptTokenV2(token);
if (!enc) fail('Encryption failed');
const { error: upErr } = await sb.from('tenants').update({ wa_access_token: enc, wa_token_expired: false }).eq('id', tenantId);
if (upErr) fail(`DB update failed: ${upErr.message}`);
console.log(`\n✅ Saved. Old token backed up to ${backupFile}. Ad spend will appear in the next report.`);
