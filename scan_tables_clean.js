// ═══════════════════════════════════════
// 🔍 Scan database - Clean Lists
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

  // 1. Fetch slots
  const { data: slots, error: slotsErr } = await supabase
    .from('restaurant_slots')
    .select('*');

  if (slotsErr) {
    console.error('❌ Error fetching restaurant_slots:', slotsErr.message);
  } else {
    console.log(`\n🍽️ Restaurant Slots (${slots?.length || 0} found):`);
    for (const s of slots || []) {
      console.log(`- Slot ID: ${s.id} | Restaurant: ${s.restaurant_id} | Time: ${s.slot_time} | Max Capacity: ${s.max_capacity} | Is Available: ${s.is_available}`);
    }
  }

  // 2. Fetch tables
  const { data: tables, error: tablesErr } = await supabase
    .from('restaurant_tables')
    .select('*');

  if (tablesErr) {
    console.error('❌ Error fetching restaurant_tables:', tablesErr.message);
  } else {
    console.log(`\n🪑 Restaurant Tables (${tables?.length || 0} found):`);
    for (const t of tables || []) {
      console.log(`- Table ID: ${t.id} | Name: ${t.name} | Capacity: ${t.capacity} | Is Active: ${t.is_active}`);
    }
  }

  // 3. Fetch templates
  const { data: templates, error: tempErr } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('tenant_id', '10d9d892-3d7f-492d-ab1a-0b3877ac48c6');

  if (tempErr) {
    console.warn('⚠️ No whatsapp_templates table or error:', tempErr.message);
  } else {
    console.log(`\n💬 WhatsApp Templates (${templates?.length || 0} found):`);
    for (const temp of templates || []) {
      console.log(`- Template: "${temp.name}" | Status: ${temp.status} | Lang: ${temp.language}`);
    }
  }
}

run().catch(console.error);
