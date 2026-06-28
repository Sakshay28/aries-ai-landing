import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load Environment Variables from .env.local ──
const root = resolve(process.cwd());
const env: Record<string, string> = {};
try {
  const envContent = readFileSync(resolve(root, '.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '');
      env[m[1]] = val;
      process.env[m[1]] = val;
    }
  }
} catch (e) {
  console.error('❌ Could not read .env.local file in project root.');
  process.exit(1);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function runLiveValidation() {
  console.log('🧪 Starting Live Production Microsoft Excel Graph API Validation...\n');

  // 1. Fetch Microsoft Excel integration config for a test tenant
  console.log('🔍 Step 1: Retrieving tenant integration configurations...');
  const { data: integrations, error: intError } = await supabase
    .from('tenant_integrations')
    .select('tenant_id, config')
    .eq('integration_id', 'microsoft_excel')
    .eq('is_active', true)
    .limit(1);

  if (intError) {
    console.error('❌ Database error retrieving integrations:', intError.message);
    process.exit(1);
  }

  if (!integrations || integrations.length === 0) {
    console.warn('⚠️ No active Microsoft Excel integrations found in your tenant_integrations database.');
    console.log('👉 To run this script, please go to the Aries AI integrations dashboard, connect your Microsoft account, and ensure it is marked active.');
    process.exit(0);
  }

  const { tenant_id: tenantId, config: rawConfig } = integrations[0];
  const cfg = rawConfig as any;
  
  // Validate token existence
  console.log('📦 Step 2: Validating OAuth Storage parameters...');
  if (!cfg.access_token) {
    console.error('❌ Error: Access Token is missing from database storage.');
    process.exit(1);
  }
  if (!cfg.refresh_token) {
    console.error('❌ Error: Refresh Token is missing from database storage.');
    process.exit(1);
  }
  console.log('   ✅ Access Token exists.');
  console.log('   ✅ Refresh Token exists.');

  const expiresAt = Number(cfg.expires_at || 0);
  const timeRemaining = expiresAt - Date.now();
  console.log(`   ⏱️ Access Token Expiration Time: ${new Date(expiresAt).toISOString()} (${(timeRemaining / 1000 / 60).toFixed(1)} mins remaining)`);

  // Decrypt token using our project crypto utils
  const { decryptToken } = await import('../src/lib/utils/crypto');
  const decAccessToken = decryptToken(cfg.access_token);
  const decRefreshToken = decryptToken(cfg.refresh_token);

  if (!decAccessToken || !decRefreshToken) {
    console.error('❌ Error: Failed to decrypt access/refresh tokens. Verify ENCRYPTION_KEY matches.');
    process.exit(1);
  }

  const spreadsheetId = cfg.spreadsheet_id;
  const sheetName = cfg.sheet_name || 'Leads';

  if (!spreadsheetId) {
    console.error('❌ Error: Workbook ID is missing from database storage.');
    process.exit(1);
  }
  console.log(`   ✅ Workbook ID found: ${spreadsheetId}`);
  console.log(`   ✅ Sheet Name found: "${sheetName}"`);

  // Helper for Graph API fetch calls
  async function callGraphAPI(url: string, method = 'GET', body?: any, useToken = decAccessToken) {
    const tStart = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${useToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const latency = Date.now() - tStart;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API failed: [${res.status}] ${text}`);
    }

    const data = await res.json();
    return { data, latency };
  }

  try {
    // 3. Test OAuth refresh flow
    console.log('\n🔄 Step 3: Verifying OAuth Token Refresh flow with Microsoft identity endpoint...');
    const refreshTStart = Date.now();
    const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.MICROSOFT_CLIENT_ID || '',
        client_secret: env.MICROSOFT_CLIENT_SECRET || '',
        refresh_token: decRefreshToken,
        grant_type:    'refresh_token',
      }),
    });
    const refreshLatency = Date.now() - refreshTStart;

    if (!refreshRes.ok) {
      throw new Error(`Token refresh failed: [${refreshRes.status}] ${await refreshRes.text()}`);
    }
    const refreshed = await refreshRes.json() as { access_token: string; expires_in: number };
    console.log(`   ✅ Token refresh flow verified in ${refreshLatency}ms. New access token obtained successfully.`);

    const activeToken = refreshed.access_token;

    // 4. Fetch sheet metadata to verify connection
    console.log('\n📡 Step 4: Probing Microsoft Graph worksheets list connectivity...');
    const worksheetsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${spreadsheetId}/workbook/worksheets`;
    const { data: sheetsData, latency: probeLatency } = await callGraphAPI(worksheetsUrl, 'GET', undefined, activeToken);
    
    const targetSheet = sheetsData.value?.find((s: any) => s.name === sheetName);
    if (!targetSheet) {
      throw new Error(`Worksheet tab "${sheetName}" not found in Excel workbook.`);
    }
    console.log(`   ✅ Worksheet tab list fetched in ${probeLatency}ms. Verified tab "${sheetName}" exists.`);

    // 5. Query used range
    console.log('\n📊 Step 5: Querying used range cells to identify customer deduplication index...');
    const usedRangeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${spreadsheetId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`;
    const { data: rangeData, latency: rangeLatency } = await callGraphAPI(usedRangeUrl, 'GET', undefined, activeToken);
    const rows = rangeData.values || [];
    console.log(`   ✅ Used range data fetched in ${rangeLatency}ms. Found ${rows.length} rows already populated.`);

    // 6. Test Appending new test row
    console.log('\n➕ Step 6: Appending customer record row to worksheet...');
    const nextRow = rows.length > 0 ? rows.length + 1 : 2;
    const writeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${spreadsheetId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${nextRow}:J${nextRow}')`;
    
    const testPayload = [
      'John Validation',
      '+15550192837',
      'WhatsApp',
      'new',
      'Sakshay Dev',
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      'Test live sync initialization message',
      'live-validation, test-lead'
    ];

    const { latency: appendLatency } = await callGraphAPI(writeUrl, 'PATCH', { values: [testPayload] }, activeToken);
    console.log(`   ✅ Customer John Validation row appended at A${nextRow} in ${appendLatency}ms.`);

    // 7. Update status column (deduplication mirror updates)
    console.log('\n🔄 Step 7: Performing status update row modifications...');
    testPayload[3] = 'Qualified';
    const { latency: updateLatency } = await callGraphAPI(writeUrl, 'PATCH', { values: [testPayload] }, activeToken);
    console.log(`   ✅ Status updated to "Qualified" in ${updateLatency}ms.`);

    // 8. Output Final Validation Status report
    console.log('\n==================================================');
    console.log('🎉 LIVE MICROSOFT EXCEL INTEGRATION VALIDATION SUCCESSFUL');
    console.log('==================================================');
    console.log(`Workbook ID:          ${spreadsheetId}`);
    console.log(`Worksheet Name:       ${sheetName}`);
    console.log(`Row Created:          A${nextRow} (John Validation)`);
    console.log(`Verification Status:  ✅ Production Ready`);
    console.log(`Refreshed Latency:    ${refreshLatency}ms`);
    console.log(`Append Latency:       ${appendLatency}ms`);
    console.log(`Update Latency:       ${updateLatency}ms`);
    console.log('==================================================\n');

  } catch (err: any) {
    console.error('\n❌ ==============================================');
    console.error('⚠️ LIVE MICROSOFT EXCEL INTEGRATION VALIDATION FAILED');
    console.error('==================================================');
    console.error(`Error Details:        ${err.message}`);
    console.error(`Verification Status:  ⚠️ Production Validation Failed`);
    console.error('==================================================\n');
    process.exit(1);
  }
}

runLiveValidation().catch(err => {
  console.error('💥 Fatal error executing live validation:', err);
  process.exit(1);
});
