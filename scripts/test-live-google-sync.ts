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
  console.log('🧪 Starting Live Production Google Sheets API Validation...\n');

  // 1. Fetch Google Sheets integration config for a test tenant
  console.log('🔍 Step 1: Retrieving tenant integration configurations...');
  const { data: integrations, error: intError } = await supabase
    .from('tenant_integrations')
    .select('tenant_id, config')
    .eq('integration_id', 'google_sheets')
    .eq('is_active', true)
    .limit(1);

  if (intError) {
    console.error('❌ Database error retrieving integrations:', intError.message);
    process.exit(1);
  }

  if (!integrations || integrations.length === 0) {
    console.warn('⚠️ No active Google Sheets integrations found in your tenant_integrations database.');
    console.log('👉 To run this script, please go to the Aries AI integrations dashboard, connect your Google account, and ensure it is marked active.');
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
    console.error('❌ Error: Spreadsheet ID is missing from database storage.');
    process.exit(1);
  }
  console.log(`   ✅ Spreadsheet ID found: ${spreadsheetId}`);
  console.log(`   ✅ Sheet Name found: "${sheetName}"`);

  // Helper for Google API fetch calls
  async function callGoogleAPI(url: string, method = 'GET', body?: any, useToken = decAccessToken) {
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
      throw new Error(`Google API failed: [${res.status}] ${text}`);
    }

    const data = await res.json();
    return { data, latency };
  }

  try {
    // 3. Test OAuth refresh flow
    console.log('\n🔄 Step 3: Verifying OAuth Token Refresh flow with Google OAuth endpoint...');
    const refreshTStart = Date.now();
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.GOOGLE_CLIENT_ID || '',
        client_secret: env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: decRefreshToken,
        grant_type:    'refresh_token',
      }),
    });
    const refreshLatency = Date.now() - refreshTStart;

    if (!refreshRes.ok) {
      throw new Error(`Token refresh failed: [${refreshRes.status}] ${await refreshRes.text()}`);
    }
    const refreshed = await refreshRes.json() as { access_token: string; expires_in: number };
    console.log(`✅ Token refresh flow verified in ${refreshLatency}ms. New access token obtained successfully.`);

    // Use refreshed token for subsequent steps to verify refresh validity
    const activeToken = refreshed.access_token;

    // 4. Fetch sheet metadata to verify connection and obtain sheetId
    console.log('\n📡 Step 4: Probing Google Sheets API connectivity and fetching sheet metadata...');
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title,sheets.properties.sheetId`;
    const { data: metaData, latency: probeLatency } = await callGoogleAPI(metaUrl, 'GET', undefined, activeToken);
    
    const targetSheet = metaData.sheets?.find((s: any) => s.properties?.title === sheetName);
    if (!targetSheet) {
      throw new Error(`Worksheet tab "${sheetName}" not found in spreadsheet.`);
    }
    const sheetId = targetSheet.properties.sheetId;
    console.log(`✅ Connection probe passed in ${probeLatency}ms.`);
    console.log(`   📄 Target Sheet Numeric ID: ${sheetId}`);

    // 5. Append validation row (Simulating new lead)
    console.log('\n➕ Step 5: Appending validation customer row (Simulating brand new lead)...');
    const testPhone = `+919999${Math.floor(100000 + Math.random() * 900000)}`;
    const testRow = [
      'Validation Test Guest',               // Customer Name
      testPhone,                             // WhatsApp Number
      'live_validation_script',              // Lead Source
      'new',                                 // Lead Status
      'E2E Tester',                          // Assigned To
      new Date().toISOString().slice(0, 19).replace('T', ' '), // Assigned At
      new Date().toISOString().slice(0, 19).replace('T', ' '), // First Contact
      new Date().toISOString().slice(0, 19).replace('T', ' '), // Last Activity
      'Testing live API connectivity...',    // Latest Message
      'live_test, production_ready'          // Tags
    ];

    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:A:append?valueInputOption=USER_ENTERED`;
    const { data: appendResult, latency: appendLatency } = await callGoogleAPI(appendUrl, 'POST', {
      values: [testRow]
    }, activeToken);
    console.log(`✅ Append operation completed in ${appendLatency}ms.`);
    console.log(`👉 Created row range: ${appendResult.updates?.updatedRange}`);

    // 6. Read spreadsheet to match phone number
    console.log('\n🔍 Step 6: Reading phone column list for match & deduplication validation...');
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!B:B`;
    const { data: readResult, latency: readLatency } = await callGoogleAPI(readUrl, 'GET', undefined, activeToken);
    console.log(`✅ Read phone list completed in ${readLatency}ms.`);

    const phoneList = readResult.values?.map((row: any) => row[0] || '') || [];
    const normPhone = (num: string) => num.replace(/[\s\+\-\(\)]/g, '');
    const targetNorm = normPhone(testPhone);
    const existingRowIdx = phoneList.findIndex((p: string, idx: number) => idx > 0 && normPhone(p) === targetNorm);

    if (existingRowIdx === -1) {
      throw new Error(`Deduplication lookup failed. Could not locate created phone ${testPhone} in sheet.`);
    }

    const spreadsheetRowNumber = existingRowIdx + 1;
    console.log(`✅ Customer phone found at Row ${spreadsheetRowNumber} (Verified deduplication match).`);

    // 7. Perform update on the validation row (Simulating state change)
    console.log(`\n🔄 Step 7: Updating Row ${spreadsheetRowNumber} (Simulating assignee and status changes)...`);
    const updatedRow = [
      'Validation Test Guest (Updated)',       // Customer Name
      testPhone,                               // WhatsApp Number
      'live_validation_script',                // Lead Source
      'qualified',                             // Lead Status (changed)
      'Sales Specialist Sakshay',              // Assigned To (changed)
      new Date().toISOString().slice(0, 19).replace('T', ' '), // Assigned At
      new Date().toISOString().slice(0, 19).replace('T', ' '), // First Contact
      new Date().toISOString().slice(0, 19).replace('T', ' '), // Last Activity (changed)
      'Assignment and status updates verified successfully!', // Latest Message (changed)
      'live_test, production_ready, updated'   // Tags
    ];

    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A${spreadsheetRowNumber}:J${spreadsheetRowNumber}?valueInputOption=USER_ENTERED`;
    const { data: updateResult, latency: updateLatency } = await callGoogleAPI(updateUrl, 'PUT', {
      values: [updatedRow]
    }, activeToken);
    console.log(`✅ Row update completed in ${updateLatency}ms.`);
    console.log(`👉 Updated row range: ${updateResult.updatedRange}`);

    // 8. Delete validation row (Pristine sheet cleanup)
    console.log(`\n🧹 Step 8: Cleaning up validation Row ${spreadsheetRowNumber} via deleteDimension...`);
    const cleanupUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const { latency: cleanupLatency } = await callGoogleAPI(cleanupUrl, 'POST', {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: spreadsheetRowNumber - 1,
              endIndex: spreadsheetRowNumber,
            }
          }
        }
      ]
    }, activeToken);
    console.log(`✅ Row cleanup deleted successfully in ${cleanupLatency}ms.`);

    // 9. Summary of performance metrics
    console.log('\n📊 ── Real-World Performance Report ──');
    console.log(`⏱️ Token Refresh Flow:       ${refreshLatency}ms`);
    console.log(`⏱️ Connection Probe Latency: ${probeLatency}ms`);
    console.log(`⏱️ Append Write Latency:     ${appendLatency}ms`);
    console.log(`⏱️ Read Match Latency:       ${readLatency}ms`);
    console.log(`⏱️ Update Write Latency:     ${updateLatency}ms`);
    console.log(`⏱️ Cleanup Delete Latency:   ${cleanupLatency}ms`);
    
    const avgLatency = (appendLatency + updateLatency) / 2;
    console.log(`⏱️ Average Write Latency:     ${avgLatency.toFixed(0)}ms`);
    console.log('──────────────────────────────────────');

    console.log('\n🎉 Production API Validation Succeeded! All scenarios verified.');
    console.log('👉 Output: SUCCESS');
  } catch (error: any) {
    console.error('\n❌ Production API Validation Failed at active operation:', error.message);
    process.exit(1);
  }
}

runLiveValidation();
