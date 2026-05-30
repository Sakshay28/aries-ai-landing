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

async function run() {
  // Find Clock Tower tenant
  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name')
    .ilike('business_name', '%clock%');

  if (!tenants?.length) {
    console.log('No Clock Tower tenant found');
    return;
  }

  const tenant = tenants[0];
  console.log(`\n🏢 Tenant: ${tenant.business_name} (${tenant.id})`);

  // Find all active conversations
  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id, sender_id, bot_paused, escalated, current_step, context, created_at, last_message_at')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false })
    .limit(5);

  console.log(`\n📋 Active conversations (${convs?.length || 0}):`);
  for (const c of convs || []) {
    const ctx = c.context as any || {};
    console.log(`\n  ID: ${c.id}`);
    console.log(`  Phone: ${c.sender_id}`);
    console.log(`  Step: ${c.current_step}`);
    console.log(`  bot_paused: ${c.bot_paused} | escalated: ${c.escalated}`);
    console.log(`  Context keys: ${Object.keys(ctx).join(', ') || 'empty'}`);
    console.log(`  booking_saved: ${ctx.booking_saved}`);
    console.log(`  Last message: ${c.last_message_at}`);
  }

  // Fix: un-escalate and un-pause all active conversations for this tenant
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ 
      escalated: false, 
      bot_paused: false,
      escalation_reason: null,
      current_step: 'greeting'
    })
    .eq('tenant_id', tenant.id)
    .eq('is_active', true);

  if (error) {
    console.error('\n❌ Reset failed:', error.message);
  } else {
    console.log('\n✅ All conversations reset: escalated=false, bot_paused=false');
  }

  // Show last 5 messages
  if (convs?.[0]) {
    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('direction, content, created_at, status')
      .eq('conversation_id', convs[0].id)
      .order('created_at', { ascending: false })
      .limit(10);

    console.log(`\n📨 Last 10 messages in most recent conversation:`);
    for (const m of (msgs || []).reverse()) {
      const time = new Date(m.created_at).toLocaleTimeString('en-IN');
      const dir = m.direction === 'inbound' ? '👤' : '🤖';
      console.log(`  ${dir} [${time}] ${m.content?.slice(0, 80)}`);
    }
  }
}

run().catch(console.error);
