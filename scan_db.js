// ═══════════════════════════════════════
// 🔍 Scan database for profiles, integrations, and flows
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

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function run() {
  console.log('🔍 Connecting to Supabase...');

  // 1. Fetch all business profiles
  const { data: profiles, error: profErr } = await supabase
    .from('business_profiles')
    .select('tenant_id, name, description, category');

  if (profErr) {
    console.error('❌ Error fetching business profiles:', profErr.message);
  } else {
    console.log(`\n🏢 Business Profiles (${profiles?.length || 0} found):`);
    for (const p of profiles || []) {
      console.log(`- Tenant: ${p.tenant_id} | Name: "${p.name}" | Category: "${p.category}" | Desc: "${p.description?.slice(0, 50)}..."`);
    }
  }

  // 2. Fetch all active integrations
  const { data: integrations, error: intErr } = await supabase
    .from('tenant_integrations')
    .select('tenant_id, integration_id, is_active, connected_at');

  if (intErr) {
    console.error('❌ Error fetching integrations:', intErr.message);
  } else {
    console.log(`\n📊 Tenant Integrations (${integrations?.length || 0} found):`);
    for (const i of integrations || []) {
      console.log(`- Tenant: ${i.tenant_id} | Integration: "${i.integration_id}" | Active: ${i.is_active} | Connected: ${i.connected_at}`);
    }
  }

  // 3. Fetch all automation flows
  const { data: flows, error: flowsErr } = await supabase
    .from('automation_flows')
    .select('tenant_id, id, name, is_active');

  if (flowsErr) {
    console.error('❌ Error fetching flows:', flowsErr.message);
  } else {
    console.log(`\n⚙️ Automation Flows (${flows?.length || 0} found):`);
    for (const f of flows || []) {
      console.log(`- Tenant: ${f.tenant_id} | Flow: "${f.name}" | Active: ${f.is_active} | ID: ${f.id}`);
    }
  }
}

run().catch(console.error);
