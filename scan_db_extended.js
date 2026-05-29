// ═══════════════════════════════════════
// 🔍 Scan database - Extended
// ═══════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔍 Connecting to Supabase...');

  // 1. Fetch smart rules
  const { data: rules, error: rulesErr } = await supabase
    .from('smart_rules')
    .select('*');

  if (rulesErr) {
    console.error('❌ Error fetching smart_rules:', rulesErr.message);
  } else {
    console.log(`\n⚙️ Smart Rules (${rules?.length || 0} found):`);
    for (const r of rules || []) {
      console.log(`- Tenant: ${r.tenant_id} | Rule: "${r.trigger_keywords}" | Action: "${r.action_type}"`);
    }
  }

  // 2. Fetch agent configs
  const { data: agents, error: agentsErr } = await supabase
    .from('agent_configs')
    .select('*');

  if (agentsErr) {
    console.error('❌ Error fetching agent_configs:', agentsErr.message);
  } else {
    console.log(`\n🧠 Agent Configs (${agents?.length || 0} found):`);
    for (const a of agents || []) {
      console.log(`- Tenant: ${a.tenant_id} | Name: "${a.name}" | Persona: "${a.persona?.slice(0, 50)}..."`);
    }
  }

  // 3. Fetch restaurant slots
  const { data: slots, error: slotsErr } = await supabase
    .from('restaurant_slots')
    .select('*, restaurant_tables(name)');

  if (slotsErr) {
    console.error('❌ Error fetching restaurant_slots:', slotsErr.message);
  } else {
    console.log(`\n🍽️ Restaurant Slots (${slots?.length || 0} found):`);
    for (const s of slots || []) {
      console.log(`- Tenant: ${s.restaurant_id} | Time: ${s.slot_time} | Max Guests: ${s.max_capacity} | Table: ${s.restaurant_tables?.name || 'Any'}`);
    }
  }

  // 4. Fetch business profiles columns
  const { data: profiles, error: profErr } = await supabase
    .from('business_profiles')
    .select('*');

  if (profErr) {
    console.error('❌ Error fetching business_profiles:', profErr.message);
  } else {
    console.log(`\n🏢 Business Profiles (${profiles?.length || 0} found):`);
    for (const p of profiles || []) {
      console.log(`- Profile data keys: ${Object.keys(p).join(', ')}`);
      console.log(`  Profile content:`, JSON.stringify(p).slice(0, 200));
    }
  }
}

run().catch(console.error);
