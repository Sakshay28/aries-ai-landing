// ═══════════════════════════════════════
// 🔍 Fetch Tenant & Flow details (Self-contained)
// ═══════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const fileContent = fs.readFileSync(path.resolve('.env.local'), 'utf-8');
const env = {};
fileContent.split('\n').forEach(line => {
  const cleanLine = line.trim();
  if (!cleanLine || cleanLine.startsWith('#')) return;
  const parts = cleanLine.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('❌ Error: Supabase URL or Service Role Key missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function run() {
  console.log('🔍 Connecting to Supabase...');

  // 1. Fetch all tenants
  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, business_name, wa_phone_number_id, wa_access_token, modules');

  if (tenantErr) {
    console.error('❌ Error fetching tenants:', tenantErr.message);
    return;
  }

  console.log(`\n🏢 Found ${tenants.length} tenants in the system:`);
  for (const t of tenants) {
    console.log(`- [${t.id}] ${t.business_name} (Modules: ${JSON.stringify(t.modules)})`);
  }

  const clockTower = tenants.find(t => t.business_name?.toLowerCase().includes('clock tower'));
  if (!clockTower) {
    console.warn('\n⚠️ Clock Tower tenant not found.');
    return;
  }

  console.log(`\n🌟 Found Clock Tower Tenant! ID: ${clockTower.id}`);

  // 2. Fetch its active integrations
  const { data: integrations, error: intErr } = await supabase
    .from('tenant_integrations')
    .select('integration_id, is_active, connected_at')
    .eq('tenant_id', clockTower.id);

  if (intErr) {
    console.error('❌ Error fetching integrations:', intErr.message);
  } else {
    console.log(`   Integrations:`);
    for (const i of integrations) {
      console.log(`   - [${i.integration_id}] Active: ${i.is_active}, Connected: ${i.connected_at}`);
    }
  }

  // 3. Fetch automation flows
  const { data: flows, error: flowsErr } = await supabase
    .from('automation_flows')
    .select('id, name, is_active')
    .eq('tenant_id', clockTower.id);

  if (flowsErr) {
    console.error('❌ Error fetching flows:', flowsErr.message);
  } else {
    console.log(`   Automation Flows:`);
    for (const f of flows) {
      console.log(`   - [${f.id}] ${f.name} (Active: ${f.is_active})`);
    }
  }
}

run().catch(console.error);
