import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

import { supabaseAdmin } from './lib/supabase/admin';

const TENANT_ID = '10d9d892-3d7f-492d-ab1a-0b3877ac48c6';
const PHONE = '919875152290';

async function run() {
  // Get most recent conversation
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .eq('sender_id', PHONE)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (!conv) { console.log('No conversation found'); return; }

  const ctx = conv.context as any || {};
  console.log('\n📋 Conversation context:');
  console.log('  current_step:', conv.current_step);
  console.log('  escalated:', conv.escalated);
  console.log('  bot_paused:', conv.bot_paused);
  console.log('\n  context keys & values:');
  for (const [k, v] of Object.entries(ctx)) {
    console.log(`    ${k}: ${JSON.stringify(v)}`);
  }

  // Simulate the booking check
  const bookingDateRaw = ctx.date || ctx.booking_date;
  const bookingTimeRaw = ctx.time || ctx.booking_time;
  const bookingGuestsRaw = ctx.guestCount || ctx.party_size;
  const hasBookingData = !!(bookingDateRaw && bookingTimeRaw && bookingGuestsRaw);
  const alreadySaved = !!ctx.booking_saved;

  console.log('\n🔍 Booking check simulation:');
  console.log('  bookingDateRaw:', bookingDateRaw);
  console.log('  bookingTimeRaw:', bookingTimeRaw);
  console.log('  bookingGuestsRaw:', bookingGuestsRaw);
  console.log('  hasBookingData:', hasBookingData);
  console.log('  alreadySaved:', alreadySaved);

  // Check last outbound message (AI confirmation)
  const { data: msgs } = await supabaseAdmin
    .from('messages')
    .select('direction, content, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n📨 Last messages:');
  for (const m of (msgs || []).reverse()) {
    const time = new Date(m.created_at).toLocaleTimeString('en-IN');
    const dir = m.direction === 'inbound' ? '👤' : '🤖';
    console.log(`  ${dir} [${time}] ${m.content?.slice(0, 100)}`);

    // Check if this is a confirmation message
    if (m.direction === 'outbound') {
      const r = m.content?.toLowerCase() || '';
      const hasConfirmSignal = 
        r.includes('confirmed') || r.includes('booking is confirmed') ||
        r.includes('table is confirmed') || r.includes('reservation is confirmed') ||
        r.includes('booked for') || r.includes('table for') || r.includes('reservation for');
      if (hasConfirmSignal) {
        console.log(`    ⚡ CONFIRM SIGNAL DETECTED in this message!`);
        console.log(`    → hasBookingData: ${hasBookingData} | alreadySaved: ${alreadySaved}`);
        console.log(`    → Would trigger booking save: ${hasConfirmSignal && hasBookingData && !alreadySaved}`);
      }
    }
  }
}

run().catch(console.error);
