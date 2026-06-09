/**
 * Conversation Race Test
 *
 * Simulates a single sender firing 6 booking messages concurrently,
 * each with a unique wa_message_id. All pass the dedup gate. All trigger
 * independent AI context reads and writes against the same conversation row.
 *
 * PHASE 1 — Full overwrite (old code)    → proves race condition
 * PHASE 2 — Atomic JSONB merge (new RPC) → proves fix works
 *
 * Run:
 *   node --env-file=.env.local src/scripts/conversation-race-test.mjs
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function uid()  { return crypto.randomBytes(6).toString('hex'); }
function ts()   { return new Date().toISOString().replace('T', ' ').slice(0, 23); }
function log(msg, indent = 0) {
  process.stdout.write(`[${ts()}] ${'  '.repeat(indent)}${msg}\n`);
}
function header(t) {
  log(''); log('═'.repeat(60)); log(`  ${t}`); log('═'.repeat(60));
}
function ok(b)  { return b ? '✅' : '❌'; }

const BOOKING_CONTEXT_FIELDS = [
  'name', 'phone', 'email', 'guestCount', 'date', 'time', 'occasion',
  'eventType', 'companyName', 'specialRequests',
  'booking_saved', 'booking_reservation_id',
  'booking_date', 'booking_time', 'party_size',
];
const BS_MAP = [
  ['guest_count', 'guestCount'],
  ['date',        'date'],
  ['time',        'time'],
  ['name',        'name'],
  ['phone',       'phone'],
];

const MESSAGES = [
  { text: 'Book me a table',          intent: 'reserve_table',  nextStep: 'ask_guests', extractedData: {} },
  { text: '6 people',                 intent: 'reserve_table',  nextStep: 'ask_date',   extractedData: { guestCount: '6' } },
  { text: 'Tomorrow',                 intent: 'reserve_table',  nextStep: 'ask_time',   extractedData: { date: '2026-06-09' } },
  { text: '8 PM',                     intent: 'reserve_table',  nextStep: 'ask_name',   extractedData: { time: '20:00' } },
  { text: 'My name is John',          intent: 'reserve_table',  nextStep: 'ask_phone',  extractedData: { name: 'John' } },
  { text: 'My number is 9999999999',  intent: 'confirm',        nextStep: 'completed',  extractedData: { phone: '9999999999' } },
];

async function getTestTenant() {
  const { data } = await supabase
    .from('tenants').select('id, business_name').eq('is_active', true).limit(1).maybeSingle();
  return data;
}

// ── PHASE 1 worker: full overwrite (old behaviour) ──────────────
async function workerFullOverwrite(tenantId, convId, msg, msgId, idx, tel) {
  const w = `W${String(idx + 1).padStart(2, '0')} [${msg.text.slice(0, 20).padEnd(20)}]`;
  const { error: ie } = await supabase.from('messages').insert({
    tenant_id: tenantId, conversation_id: convId,
    direction: 'inbound', content: msg.text, message_type: 'text',
    channel: 'whatsapp', sender_id: '919999999999', status: 'delivered',
    ai_generated: false, wa_message_id: msgId,
  });
  if (ie) { tel.insertBlocked++; return; }
  tel.insertOk++;

  const { data: row } = await supabase.from('conversations')
    .select('context').eq('id', convId).single();
  tel.reads++;
  const prev = row?.context || {};
  log(`  ${w} 📖 read prev=${JSON.stringify(prev)}`, 1);

  await new Promise(r => setTimeout(r, 10 + Math.random() * 90));
  tel.aiCalls++;

  const upd = {};
  for (const field of BOOKING_CONTEXT_FIELDS) {
    const nv = msg.extractedData?.[field];
    const ov = prev[field];
    const v = (nv !== null && nv !== undefined && nv !== 'null') ? nv : ov;
    if (v !== undefined && v !== null && v !== 'null') upd[field] = v;
  }
  const prevBS = prev.booking_state || {};
  const newBS  = { ...prevBS };
  for (const [bk, ek] of BS_MAP) {
    const v = msg.extractedData?.[ek];
    if (v && v !== 'null') newBS[bk] = v;
  }
  upd.booking_state = newBS;

  const { error: we } = await supabase.from('conversations')
    .update({ context: upd, current_step: msg.nextStep, last_message_at: new Date().toISOString() })
    .eq('id', convId);
  if (we) { tel.writeErrors++; return; }
  tel.writes++;
  tel.writeLog.push({ w, bs: JSON.parse(JSON.stringify(newBS)) });
  log(`  ${w} ✏️  overwrite bs=${JSON.stringify(newBS)}`, 1);
}

// ── PHASE 2 worker: atomic RPC merge (new behaviour) ───────────
async function workerAtomicMerge(tenantId, convId, msg, msgId, idx, tel) {
  const w = `W${String(idx + 1).padStart(2, '0')} [${msg.text.slice(0, 20).padEnd(20)}]`;
  const { error: ie } = await supabase.from('messages').insert({
    tenant_id: tenantId, conversation_id: convId,
    direction: 'inbound', content: msg.text, message_type: 'text',
    channel: 'whatsapp', sender_id: '919999999998', status: 'delivered',
    ai_generated: false, wa_message_id: msgId,
  });
  if (ie) { tel.insertBlocked++; return; }
  tel.insertOk++;

  tel.reads++;
  await new Promise(r => setTimeout(r, 10 + Math.random() * 90));
  tel.aiCalls++;

  const contextDelta = {};
  for (const field of BOOKING_CONTEXT_FIELDS) {
    const v = msg.extractedData?.[field];
    if (v !== null && v !== undefined && v !== 'null') contextDelta[field] = v;
  }
  const bookingStateDelta = {};
  for (const [bk, ek] of BS_MAP) {
    const v = msg.extractedData?.[ek];
    if (v && v !== 'null') bookingStateDelta[bk] = v;
  }

  const { error: rpcErr } = await supabase.rpc('update_conversation_after_ai', {
    p_conv_id:             convId,
    p_context_delta:       contextDelta,
    p_booking_state_delta: bookingStateDelta,
    p_booking_state_reset: false,
    p_current_step:        msg.nextStep,
    p_last_message_at:     new Date().toISOString(),
    p_escalated:           false,
    p_escalated_at:        null,
    p_escalation_reason:   null,
  });
  if (rpcErr) { tel.writeErrors++; log(`  ${w} ❌ RPC: ${rpcErr.message}`, 1); return; }
  tel.writes++;

  const { data: cur } = await supabase.from('conversations')
    .select('context').eq('id', convId).single();
  const curBS = cur?.context?.booking_state || {};
  tel.writeLog.push({ w, bs: JSON.parse(JSON.stringify(curBS)) });
  log(`  ${w} ✅ RPC merged — current bs=${JSON.stringify(curBS)}`, 1);
}

async function runPhase(tenantId, senderPhone, label, workerFn, msgPrefix) {
  header(label);
  const { data: convRow } = await supabase.from('conversations').insert({
    tenant_id: tenantId, sender_id: senderPhone, channel: 'whatsapp',
    current_step: 'greeting', is_active: true, bot_paused: false,
    escalated: false, message_count: 0, context: {}, last_message_at: new Date().toISOString(),
  }).select('id').single();
  const convId = convRow.id;
  const msgIds = MESSAGES.map(() => `${msgPrefix}_${uid()}`);
  log(`conv_id : ${convId}`);
  log(`msg_ids : ${msgIds.join(', ')}`);

  const tel = { insertOk: 0, insertBlocked: 0, aiCalls: 0, reads: 0, writes: 0, writeErrors: 0, writeLog: [] };
  const t0 = Date.now();
  log(`\nFiring ${MESSAGES.length} workers simultaneously...`);
  await Promise.all(MESSAGES.map((msg, i) => workerFn(tenantId, convId, msg, msgIds[i], i, tel)));
  const elapsed = Date.now() - t0;

  const { data: final } = await supabase.from('conversations')
    .select('context, current_step').eq('id', convId).single();
  const finalBS = final?.context?.booking_state || {};

  log('\n── TELEMETRY ───────────────────────────────────────────────');
  log(`  Elapsed          : ${elapsed}ms`);
  log(`  Messages inserted: ${tel.insertOk} / ${MESSAGES.length}`);
  log(`  AI calls         : ${tel.aiCalls}`);
  log(`  Context reads    : ${tel.reads}`);
  log(`  Context writes   : ${tel.writes}`);
  log(`  Write errors     : ${tel.writeErrors}`);
  log('\n── WRITE LOG (chronological) ───────────────────────────────');
  tel.writeLog.forEach((e, i) => log(`  #${i+1} ${e.w}  bs=${JSON.stringify(e.bs)}`));
  log('\n── FINAL booking_state IN DB ───────────────────────────────');
  log(`  ${JSON.stringify(finalBS)}`);
  log(`  current_step: ${final?.current_step}`);

  const expected = { guest_count: '6', date: '2026-06-09', time: '20:00', name: 'John', phone: '9999999999' };
  log('\n── FIELD VERIFICATION ──────────────────────────────────────');
  let allPresent = true;
  for (const [k, v] of Object.entries(expected)) {
    const got = finalBS[k];
    const pass = got === v;
    if (!pass) allPresent = false;
    log(`  ${ok(pass)}  ${k.padEnd(15)}: expected="${v}" got="${got ?? 'MISSING'}"`);
  }
  log(`\n  VERDICT: ${allPresent ? '✅ ALL FIELDS PRESENT — NO LOSS' : '❌ FIELDS LOST — RACE CONDITION'}`);

  await supabase.from('messages').delete().in('wa_message_id', msgIds);
  await supabase.from('conversations').delete().eq('id', convId);
  return { allPresent, finalBS };
}

async function main() {
  log('AriesAI — Conversation Race Test');
  log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  const tenant = await getTestTenant();
  if (!tenant) { log('❌ No tenant'); process.exit(1); }
  log(`Tenant  : ${tenant.business_name} (${tenant.id})`);
  log('Messages: 6 unique wa_message_ids, same sender, same conversation');
  log('Content : "Book me a table" | "6 people" | "Tomorrow" | "8 PM" | "My name is John" | "My number is 9999999999"');

  const p1 = [], p2 = [];
  for (let r = 1; r <= 3; r++) {
    p1.push(await runPhase(tenant.id, '919999999999', `PHASE 1 — Full overwrite — Run ${r}/3`, workerFullOverwrite, 'race'));
    await new Promise(res => setTimeout(res, 200));
  }

  // Check if RPC exists before running Phase 2
  const { error: rpcCheck } = await supabase.rpc('update_conversation_after_ai', {
    p_conv_id: '00000000-0000-0000-0000-000000000000',
    p_context_delta: {}, p_booking_state_delta: {}, p_booking_state_reset: false,
    p_current_step: 'test', p_last_message_at: new Date().toISOString(),
    p_escalated: false, p_escalated_at: null, p_escalation_reason: null,
  });
  const rpcMissing = rpcCheck && (rpcCheck.code === 'PGRST202' || rpcCheck.message?.includes('Could not find'));
  if (rpcMissing) {
    log('\n⚠️  RPC update_conversation_after_ai not found — skipping Phase 2.');
    log('   Apply the migration first: supabase/migrations/20260608_atomic_context_merge.sql');
    log('   Then re-run this script to verify the fix.');
  } else {
    for (let r = 1; r <= 3; r++) {
      p2.push(await runPhase(tenant.id, '919999999998', `PHASE 2 — Atomic RPC merge — Run ${r}/3`, workerAtomicMerge, 'merge'));
      await new Promise(res => setTimeout(res, 200));
    }
  }

  header('COMPARISON SUMMARY');
  log('  Phase 1 — Full overwrite (OLD code):');
  p1.forEach((r, i) => {
    const lost = Object.entries({ guest_count:'6', date:'2026-06-09', time:'20:00', name:'John', phone:'9999999999' })
      .filter(([k,v]) => r.finalBS[k] !== v).map(([k]) => k);
    log(`    Run ${i+1}: ${r.allPresent ? '✅ all fields' : `❌ LOST [${lost.join(', ')}]`}  final=${JSON.stringify(r.finalBS)}`);
  });
  if (p2.length) {
    log('');
    log('  Phase 2 — Atomic RPC merge (NEW code):');
    p2.forEach((r, i) => {
      const lost = Object.entries({ guest_count:'6', date:'2026-06-09', time:'20:00', name:'John', phone:'9999999999' })
        .filter(([k,v]) => r.finalBS[k] !== v).map(([k]) => k);
      log(`    Run ${i+1}: ${r.allPresent ? '✅ all fields' : `❌ LOST [${lost.join(', ')}]`}  final=${JSON.stringify(r.finalBS)}`);
    });
    const p1Loss = p1.filter(r => !r.allPresent).length;
    const p2Loss = p2.filter(r => !r.allPresent).length;
    log('');
    log(`  Phase 1 field-loss rate: ${p1Loss}/3`);
    log(`  Phase 2 field-loss rate: ${p2Loss}/3`);
    if (p1Loss > 0 && p2Loss === 0) {
      log('');
      log('  ✅ Fix confirmed: atomic RPC merge eliminates the race condition.');
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
