const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('🔍 Fetching an active tenant with Meta WhatsApp credentials from database...');
  
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, business_name, wa_phone_number_id, wa_verify_token')
    .eq('is_active', true)
    .not('wa_phone_number_id', 'is', null)
    .limit(1);

  if (error) {
    console.error('❌ Failed to fetch tenants:', error);
    process.exit(1);
  }

  if (!tenants || tenants.length === 0) {
    console.warn('⚠️ No active tenant found with wa_phone_number_id. Fetching any active tenant instead...');
    const { data: fallbackTenants, error: err2 } = await supabase
      .from('tenants')
      .select('id, business_name, wa_phone_number_id, wa_verify_token')
      .eq('is_active', true)
      .limit(1);
      
    if (err2 || !fallbackTenants || fallbackTenants.length === 0) {
      console.error('❌ No active tenants found in the database.');
      process.exit(1);
    }
    tenants.push(...fallbackTenants);
  }

  const tenant = tenants[0];
  const phoneId = tenant.wa_phone_number_id || 'MOCK_PHONE_NUMBER_ID';
  const verifyToken = tenant.wa_verify_token || 'MOCK_VERIFY_TOKEN';

  console.log(`\n📋 TARGET TENANT CONFIGURATION:`);
  console.log(`   - ID:            ${tenant.id}`);
  console.log(`   - Business Name: ${tenant.business_name}`);
  console.log(`   - Phone ID:      ${phoneId}`);
  console.log(`   - Verify Token:  ${verifyToken}`);

  console.log('\n---');
  console.log('🧪 TESTING GET (Webhook Verification Handshake)');
  const challenge = 'challenge_token_xyz_' + Math.floor(Math.random() * 1000);
  const getUrl = `http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=${challenge}&hub.verify_token=${verifyToken}`;
  
  console.log(`GET Target: ${getUrl}`);

  // Test GET request locally
  try {
    const getRes = await fetch(getUrl);
    const getBody = await getRes.text();
    if (getRes.status === 200 && getBody === challenge) {
      console.log('✅ GET Handshake Test: SUCCESS!');
    } else {
      console.log(`❌ GET Handshake Test: FAILED. Status: ${getRes.status}, Body: "${getBody}"`);
    }
  } catch (err) {
    console.log(`ℹ️ Local server not responding for GET test (is "npm run dev" running?): ${err.message}`);
  }

  console.log('\n---');
  console.log('🧪 TESTING POST (Incoming Message Event)');
  
  const mockMessageId = 'wamid.HBgLMTk5OTk5OTk5OTkVBRgIdEgUzQ0RFQ0RE' + Math.floor(Math.random() * 100000) + '==';
  
  const postPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234567890',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15555555555',
                phone_number_id: phoneId
              },
              contacts: [
                {
                  profile: {
                    name: 'Test Customer'
                  },
                  wa_id: '919999999999'
                }
              ],
              messages: [
                {
                  from: '919999999999',
                  id: mockMessageId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: {
                    body: 'Hello Aries AI! This is a test webhook message sent from the scratch verification script.'
                  },
                  type: 'text'
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  const rawPostPayload = JSON.stringify(postPayload);
  const postUrl = 'http://localhost:3000/api/webhooks/whatsapp';
  
  console.log(`POST Target: ${postUrl}`);

  // If a META_APP_SECRET is set or defined locally, compute the x-hub-signature-256
  const appSecret = process.env.META_APP_SECRET || '';
  const headers = { 'Content-Type': 'application/json' };
  
  if (appSecret) {
    const signature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawPostPayload).digest('hex');
    headers['x-hub-signature-256'] = signature;
    console.log(`🔑 Computed x-hub-signature-256 header using META_APP_SECRET: ${signature}`);
  } else {
    console.log('ℹ️ No META_APP_SECRET provided. Skipping HMAC signature header (Server will allow request if App Secret is not configured in env).');
  }

  // Test POST request locally
  try {
    const postRes = await fetch(postUrl, {
      method: 'POST',
      headers,
      body: rawPostPayload
    });
    const postBody = await postRes.json();
    if (postRes.status === 200) {
      console.log('✅ POST Message Test: SUCCESS! Response:', postBody);
    } else {
      console.log(`❌ POST Message Test: FAILED. Status: ${postRes.status}, Response:`, postBody);
    }
  } catch (err) {
    console.log(`ℹ️ Local server not responding for POST test (is "npm run dev" running?): ${err.message}`);
  }

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('💡 HOW TO RUN MANUAL CURL TESTS');
  console.log('═════════════════════════════════════════════════════════════');
  console.log('1. Start your local dev server:');
  console.log('   npm run dev\n');
  console.log('2. Run this GET handshake verification Curl command:');
  console.log(`   curl -i "${getUrl}"\n`);
  console.log('3. Run this POST message webhook Curl command:');
  console.log(`   curl -i -X POST -H "Content-Type: application/json" \\`);
  if (appSecret) {
    const sig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawPostPayload).digest('hex');
    console.log(`        -H "x-hub-signature-256: ${sig}" \\`);
  }
  console.log(`        -d '${rawPostPayload}' \\`);
  console.log(`        "${postUrl}"\n`);
}

run();
