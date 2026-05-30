import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

import { supabaseAdmin } from './lib/supabase/admin';
import { decryptToken, encryptToken } from './lib/utils/crypto';

const TENANT_ID = '10d9d892-3d7f-492d-ab1a-0b3877ac48c6';

async function run() {
  console.log('\n🔍 Diagnosing Google Sheets integration...\n');

  // 1. Fetch config from DB
  const { data, error } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config, is_active, connected_at, updated_at')
    .eq('tenant_id', TENANT_ID)
    .eq('integration_id', 'google_sheets')
    .single();

  if (error || !data) {
    console.error('❌ No Google Sheets integration found:', error?.message || 'no data');
    return;
  }

  const cfg = data.config as any;
  console.log('✅ Integration found');
  console.log('  is_active:', data.is_active);
  console.log('  connected_at:', data.connected_at);
  console.log('  updated_at:', data.updated_at);
  console.log('  spreadsheet_id:', cfg.spreadsheet_id);
  console.log('  sheet_name:', cfg.sheet_name);
  console.log('  expires_at:', new Date(cfg.expires_at).toLocaleString('en-IN'));
  console.log('  token expired?', Date.now() > cfg.expires_at - 60_000);
  console.log('  has access_token?', !!cfg.access_token);
  console.log('  has refresh_token?', !!cfg.refresh_token);

  // 2. Decrypt and test the access token
  let token: string;
  try {
    if (Date.now() > cfg.expires_at - 60_000) {
      console.log('\n🔄 Token expired — refreshing...');
      const refreshToken = decryptToken(cfg.refresh_token) as string;
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const json = await res.json() as any;
      if (!res.ok) {
        console.error('❌ Token refresh FAILED:', JSON.stringify(json));
        return;
      }
      token = json.access_token;
      console.log('✅ Token refreshed successfully');

      // Save new token to DB
      const newCfg = { ...cfg, access_token: encryptToken(token), expires_at: Date.now() + json.expires_in * 1000 };
      await supabaseAdmin.from('tenant_integrations')
        .update({ config: newCfg })
        .eq('tenant_id', TENANT_ID)
        .eq('integration_id', 'google_sheets');
      console.log('✅ New token saved to DB');
    } else {
      token = decryptToken(cfg.access_token) as string;
      console.log('\n✅ Token still valid');
    }
  } catch (e: any) {
    console.error('❌ Token error:', e.message);
    return;
  }

  // 3. Test spreadsheet access
  console.log('\n📊 Testing spreadsheet access...');
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheet_id}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json() as any;
  if (!metaRes.ok) {
    console.error('❌ Spreadsheet access FAILED:', JSON.stringify(meta));
    return;
  }
  const tabs = meta.sheets?.map((s: any) => s.properties?.title) || [];
  console.log('✅ Spreadsheet accessible. Tabs:', tabs.join(', '));

  // 4. Test append to Bookings tab
  console.log('\n📝 Testing append to Bookings tab...');
  const testRow = [
    ['TEST-Sakshay', '919875152290', '4', '31 May 2026', '8:30 PM', 'confirmed', '0', 'Test row', ''],
  ];
  const appendRange = 'Bookings!A:I';
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheet_id}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: testRow }),
    }
  );
  const appendJson = await appendRes.json() as any;
  if (!appendRes.ok) {
    console.error('❌ Append FAILED:', JSON.stringify(appendJson));
  } else {
    console.log('✅ TEST ROW APPENDED SUCCESSFULLY!');
    console.log('  Updated range:', appendJson.updates?.updatedRange);
    console.log('  Rows added:', appendJson.updates?.updatedRows);
  }
}

run().catch(console.error);
