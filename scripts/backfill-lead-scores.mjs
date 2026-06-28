#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// One-time backfill: replay all historical inbound messages through the
// V2 lead scoring engine for a given tenant.
//
// Usage:
//   node scripts/backfill-lead-scores.mjs <tenant_name_or_id> [--dry-run]
//
// Examples:
//   node scripts/backfill-lead-scores.mjs globesome
//   node scripts/backfill-lead-scores.mjs globesome --dry-run
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env.local ───────────────────────────────────────────────────────────
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const tenantArg = process.argv[2];
const dryRun    = process.argv.includes('--dry-run');

if (!tenantArg) {
  console.error('Usage: node scripts/backfill-lead-scores.mjs <tenant_name_or_id> [--dry-run]');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINED SCORING ENGINE (mirrors src/lib/scoring/lead-scoring-engine.ts)
// Keep in sync if engine patterns change.
// ═══════════════════════════════════════════════════════════════════════════════

const SCORE_THRESHOLDS = { COLD: 0, WARM: 30, HOT: 70, QUALIFIED: 90 };
const AI_CONFIDENCE_THRESHOLD = 0.55;

const INTEREST_PATTERNS = [
  { key: 'asked_pricing',        points: 15, patterns: [/\b(prices?|pricing|costs?|charges?|fees?|how much|rates?|tariff|amounts?|budget)\b/i, /\b(kitna|kaas|daam|lagat|paisa|rupee|rs\.|₹|cost kya|price kya|kitne mein|kitna hai)\b/i] },
  { key: 'asked_dates',          points: 15, patterns: [/\b(dates?|when|kab|schedule|calendar|months?|timing)/i, /\b(january|february|march|april|may|june|july|august|september|october|november|december)/i, /\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i, /\b(kab se|kab tak|kitne din|konsa mahina|agla month)\b/i] },
  { key: 'asked_itinerary',      points: 10, patterns: [/\b(itinerary|programme|program|day.by.day|day wise|plan|route|trek|expedition|journey)\b/i, /\b(schedule details|what.s the plan|full details|complete details|kya kya hoga)\b/i] },
  { key: 'asked_availability',   points: 10, patterns: [/\b(availab|seats?|slots?|spots?|capacity|how many.*(left|remain|open)|vacancy|space)/i, /\b(kitni jagah|seats bache|seat hai|slot available|open slots?)/i] },
  { key: 'asked_inclusions',     points: 8,  patterns: [/\b(includ|inclusion|what.s included|what is covered|package includes|what.s covered|what do (you|we) get)\b/i, /\b(kya kya milega|kya include|sab kuch milega|sab shamil)\b/i] },
  { key: 'asked_payment_method', points: 20, patterns: [/\b(payments?|pay\b|paying|paid|upi|neft|imps|transfer|advance|deposit|installments?|emi|razorpay|gpay|phonepe|paytm|how to pay|payment method)\b/i, /\b(paise kaise|payment kaise|advance kitna|booking amount|token amount)\b/i] },
  { key: 'asked_booking_process',points: 25, patterns: [/\b(how (do i|can i|to) book|booking process|kaise book|steps to book|procedure|how.*register|sign up|how.*enroll)\b/i, /\b(book karna hai|register kaise|join kaise|kaise le sakte|kya process)\b/i] },
  { key: 'asked_cancellation',   points: 8,  patterns: [/\b(cancel|cancellation|refund|policy|non.refundable|reschedul)\b/i, /\b(paise wapas|cancel ho|refund milega|policy kya)\b/i] },
  { key: 'asked_accommodation',  points: 8,  patterns: [/\b(hotels?|accommodation|lodge|hostel|camps?|tent|guesthouse|where.*(stay|sleep))\b/i, /\b(kahan rukenge|kahan rahenge|stay kahan|raha kahan)\b/i] },
  { key: 'asked_difficulty',     points: 8,  patterns: [/\b(difficult|fitness|requirement|experience|beginner|expert|age.limit|medical)\b/i, /\b(kitna mushkil|mushkil hai|kar sakta|beginner ke liye|experience chahiye)\b/i] },
];

const BUYING_INTENT_PATTERNS = [
  { key: 'intent_book',            points: 40, patterns: [/\b((i )?(want|wanna) (to )?(book|join|register|enroll|reserve))\b/i, /\b(i.m (interested|ready) (to|in) (book|join|register))\b/i, /\b(count me in|i.m in|i.ll (join|book|take it)|let.s do it)\b/i, /\b(book karna hai|join karna hai|lena hai|confirm karna hai|book kar)\b/i] },
  { key: 'intent_reserve',         points: 40, patterns: [/\b(reserve (my|a|the|one)|book (a |my )?(table|seat|spot|slot|place|room)|i want (a |to )?reserve)\b/i, /\b(seat reserve|jagah pakdo|hold kar|block kar)\b/i] },
  { key: 'intent_payment_link',    points: 50, patterns: [/\b(send (me )?(the |a )?payment link|payment link (please|bhejo|do)|send invoice|link bhejo|upi (id|number) bhejo)\b/i, /\b(how (do|can) i pay|pay (now|today|online)|ready to pay|pay kar sakta)\b/i] },
  { key: 'intent_confirm_booking', points: 60, patterns: [/\b(confirm (my |the )?(booking|reservation|seat|registration)|is (my|the) booking confirmed|booking (id|number|confirmed)?)\b/i, /\b(booking confirm|seat confirm|registration confirm)\b/i] },
  { key: 'intent_when_book',       points: 30, patterns: [/\b(when can i (book|pay|reserve|register)|can i book (now|today|right now)|book (now|today|asap))\b/i, /\b(ab book karu|abhi book|turant book|kab book kar sakta)\b/i] },
];

// ── Industry-specific patterns (keyed by profile name) ───────────────────────
const INDUSTRY_PATTERNS = {
  travel: [
    { key: 'ind_altitude',        points: 8,  patterns: [/\b(altitude|elevation|difficult|fitness|beginner|expert|experience.required|level)\b/i] },
    { key: 'ind_permits',         points: 10, patterns: [/\b(permit|permissions?|visa|inner.line|restricted.area|pass|icp)\b/i] },
    { key: 'ind_guide',           points: 8,  patterns: [/\b(guide|leader|team size|instructor|porter|support staff)\b/i] },
    { key: 'ind_expedition_named',points: 20, patterns: [/\b(zanskar|ladakh|spiti|manali|kedarkantha|roopkund|chadar|valley of flowers|sar pass|hampta|goecha|sandakphu|brahmatal|kedarnath|markha|pin parvati)\b/i] },
    { key: 'ind_group_type',      points: 8,  patterns: [/\b(group (trek|expedition|tour)|private (tour|trek)|solo|batch|team)\b/i] },
  ],
  restaurant: [
    { key: 'ind_table_size',   points: 10, patterns: [/\b(table for|party of|group of|\bpax\b|cover|how many people)\b/i] },
    { key: 'ind_occasion',     points: 15, patterns: [/\b(birthday|anniversary|engagement|proposal|romantic|surprise|celebration|corporate (dinner|lunch)|family (dinner|gathering))\b/i] },
    { key: 'ind_dietary',      points: 8,  patterns: [/\b(vegetarian|vegan|jain|halal|gluten.free|allerg|dairy.free|kosher|eggless)\b/i] },
    { key: 'ind_menu',         points: 8,  patterns: [/\b(menu|dishes?|cuisine|chef|signature dish|food options?|what do you serve)\b/i] },
    { key: 'ind_private_room', points: 20, patterns: [/\b(private (room|dining|area|space)|exclusive|buyout|event space|banquet)\b/i] },
  ],
  general: [],
};

const NEGATIVE_PATTERNS = [
  { key: 'not_interested', points: -100, patterns: [/\b(not interested|no thanks|nahi chahiye|don.t need|no need|not required|no longer interested)\b/i, /\b(nahi chahiye|nahi lena|interest nahi|mujhe nahi)\b/i] },
  { key: 'just_browsing',  points: -10,  patterns: [/\b(just (browsing|looking|checking|seeing|curious|asking)|sirf dekh|just wanted to know|just enquiring)\b/i, /\b(sirf puch raha|bas dekh raha|abhi confirm nahi|pehle pata karna)\b/i] },
  { key: 'wrong_number',   points: -50,  patterns: [/\b(wrong number|wrong person|galat number|galat jagah|wrong chat)\b/i] },
];

const ENGAGEMENT_MILESTONES = [
  { key: 'messages_5',  points: 10, threshold: 5  },
  { key: 'messages_10', points: 15, threshold: 10 },
  { key: 'messages_15', points: 10, threshold: 15 },
];

const ALLOWED_AUTO_TRANSITIONS = {
  new:       new Set(['cold', 'warm', 'hot', 'qualified', 'lost']),
  cold:      new Set(['warm', 'hot', 'qualified', 'lost']),
  warm:      new Set(['cold', 'hot', 'qualified', 'lost']),
  hot:       new Set(['warm', 'qualified', 'lost']),
  qualified: new Set(['hot', 'converted', 'lost']),
  converted: new Set(),
  lost:      new Set(['cold', 'warm', 'hot', 'qualified']),
};

function deriveStatus(score, currentStatus, newNegativeSignals) {
  if (currentStatus === 'converted') return 'converted';
  if (newNegativeSignals.includes('not_interested') || newNegativeSignals.includes('wrong_number')) return 'lost';
  if (score >= SCORE_THRESHOLDS.QUALIFIED) return 'qualified';
  if (score >= SCORE_THRESHOLDS.HOT)       return 'hot';
  if (score >= SCORE_THRESHOLDS.WARM)      return 'warm';
  return 'cold';
}

// Scores a single message, accumulating onto existing lead state
function scoreMessage(text, msgIndex, totalMsgCount, existingScore, existingStatus, allCounted, industryProfile = 'general') {
  text = text ?? '';
  let delta = 0;
  const newSignals = [];
  const newNegativeSignals = [];
  const breakdown = {};

  function addSignal(key, label, points, category) {
    if (points === 0 || !label) return;
    breakdown[key] = { label, points, category };
    if (points > 0) newSignals.push(key);
    else            newNegativeSignals.push(key);
    allCounted.add(key);
    delta += points;
  }

  for (const { key, points, patterns } of INTEREST_PATTERNS) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) addSignal(key, key.replace(/_/g, ' '), points, 'interest');
  }
  for (const { key, points, patterns } of BUYING_INTENT_PATTERNS) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) addSignal(key, key.replace(/_/g, ' '), points, 'intent');
  }
  // Industry-specific patterns
  for (const { key, points, patterns } of (INDUSTRY_PATTERNS[industryProfile] ?? [])) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) addSignal(key, key.replace(/_/g, ' '), points, 'industry');
  }

  for (const { key, points, patterns } of NEGATIVE_PATTERNS) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) addSignal(key, key.replace(/_/g, ' '), points, 'negative');
  }

  // Engagement milestones — check based on message index
  for (const { key, points, threshold } of ENGAGEMENT_MILESTONES) {
    if (msgIndex >= threshold && !allCounted.has(key)) addSignal(key, `Conversation >${threshold} messages`, points, 'engagement');
  }

  // First-message greeting penalty
  if (msgIndex === 1) {
    const trimmed = text.trim();
    if (/^(hi+|hello|hey|hii+|hola|namaskar|namaste|hy|helo|heya|sup|yo|heys?|hai|haan|haa)\.?!?\s*$/i.test(trimmed) && !allCounted.has('only_greeting')) {
      addSignal('only_greeting', 'Greeting only', -10, 'negative');
    }
  }

  const rawScore = existingScore + delta;
  const newScore = Math.min(100, Math.max(0, rawScore));
  const newNegKeys = newNegativeSignals;
  const newStatus = deriveStatus(newScore, existingStatus, newNegKeys);

  const allowed = ALLOWED_AUTO_TRANSITIONS[existingStatus] ?? new Set(['cold','warm','hot','qualified','lost']);
  const validatedStatus = allowed.has(newStatus) ? newStatus : existingStatus;

  return {
    score: newScore,
    status: validatedStatus,
    newSignals: [...newSignals, ...newNegativeSignals],
    breakdown,
    delta,
  };
}

// Replay all messages for a lead and return final scoring state
function replayMessages(messages, industryProfile = 'general') {
  let score = 0;
  let status = 'new';
  const allCounted = new Set();
  const allBuyingSignals = [];
  const allNegativeSignals = [];
  const allBreakdown = {};
  let inboundCount = 0;

  const inboundMsgs = messages.filter(m => m.direction === 'inbound');

  for (const msg of inboundMsgs) {
    inboundCount++;
    const result = scoreMessage(msg.content, inboundCount, inboundMsgs.length, score, status, allCounted, industryProfile);
    score  = result.score;
    status = result.status;

    for (const sig of result.newSignals) {
      if (result.breakdown[sig]?.points > 0) allBuyingSignals.push(sig);
      else                                    allNegativeSignals.push(sig);
    }
    Object.assign(allBreakdown, result.breakdown);
  }

  const reasons = Object.values(allBreakdown)
    .filter(e => e.points > 0).map(e => `✓ ${e.label}`)
    .concat(Object.values(allBreakdown).filter(e => e.points < 0).map(e => `✗ ${e.label}`));

  return {
    lead_score:       score,
    lead_status:      status,
    auto_status:      status,
    buying_signals:   allBuyingSignals,
    negative_signals: allNegativeSignals,
    score_breakdown:  allBreakdown,
    scoring_reasoning: reasons.join('; ') || 'No signals detected',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n🔍 Looking up tenant: "${tenantArg}"${dryRun ? '  [DRY RUN — no writes]' : ''}\n`);

  // ── Find tenant ──────────────────────────────────────────────────────────────
  let tenant;
  // Try UUID first
  if (/^[0-9a-f-]{36}$/i.test(tenantArg)) {
    const { data } = await supabase.from('tenants').select('id, business_name').eq('id', tenantArg).single();
    tenant = data;
  }
  // Else search by name
  if (!tenant) {
    const { data } = await supabase.from('tenants').select('id, business_name').ilike('business_name', `%${tenantArg}%`).limit(5);
    if (!data || data.length === 0) { console.error(`❌ No tenant found matching "${tenantArg}"`); process.exit(1); }
    if (data.length > 1) {
      console.log('Multiple tenants found — using first match:');
      data.forEach(t => console.log(`  ${t.id}  ${t.business_name}`));
    }
    tenant = data[0];
  }

  console.log(`✅ Tenant: ${tenant.business_name} (${tenant.id})`);

  // ── Detect industry ──────────────────────────────────────────────────────────
  const { data: bizProfile } = await supabase.from('business_profiles').select('industry').eq('tenant_id', tenant.id).maybeSingle();
  const rawIndustry = (bizProfile?.industry ?? '').toLowerCase();
  let industryProfile = 'general';
  if (/travel|trek|tour|expedition|adventure|tourism/.test(rawIndustry))       industryProfile = 'travel';
  else if (/restaurant|food|dine|cafe|bistro|dhaba|eatery/.test(rawIndustry)) industryProfile = 'restaurant';
  console.log(`   Industry: "${bizProfile?.industry ?? 'not set'}" → profile: ${industryProfile}\n`);

  // ── Fetch all leads for this tenant ─────────────────────────────────────────
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, lead_score, lead_status, buying_signals, negative_signals, last_message_at, created_at')
    .eq('tenant_id', tenant.id)
    .not('lead_status', 'in', '("converted")')
    .order('created_at', { ascending: true });

  if (leadsErr) { console.error('❌ Error fetching leads:', leadsErr.message); process.exit(1); }
  if (!leads || leads.length === 0) { console.log('No leads found for this tenant.'); return; }

  console.log(`📋 Found ${leads.length} leads to process\n`);

  let scored = 0, skipped = 0, errors = 0;
  const results = [];

  for (const lead of leads) {
    try {
      // ── Fetch all conversations for this lead ──────────────────────────────
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('lead_id', lead.id);

      if (!convs || convs.length === 0) { skipped++; continue; }

      const convIds = convs.map(c => c.id);

      // ── Fetch all inbound messages across all conversations ────────────────
      const { data: messages } = await supabase
        .from('messages')
        .select('direction, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true });

      if (!messages || messages.length === 0) { skipped++; continue; }

      const inboundCount = messages.filter(m => m.direction === 'inbound').length;
      if (inboundCount === 0) { skipped++; continue; }

      // ── Replay messages through engine ────────────────────────────────────
      const result = replayMessages(messages, industryProfile);

      results.push({ lead, result, inboundCount });

      const scoreChange  = result.lead_score !== (lead.lead_score ?? 0);
      const statusChange = result.lead_status !== lead.lead_status;
      const tag = scoreChange || statusChange ? '📈' : '·';

      console.log(
        `${tag} ${lead.id.slice(0, 8)}  ` +
        `${String(lead.lead_status ?? 'new').padEnd(10)} → ${String(result.lead_status).padEnd(10)}  ` +
        `score: ${String(lead.lead_score ?? 0).padStart(3)} → ${String(result.lead_score).padStart(3)}  ` +
        `signals: [${result.buying_signals.join(', ')}]`
      );

      // ── Write to DB (unless dry run) ──────────────────────────────────────
      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from('leads')
          .update({
            lead_score:        result.lead_score,
            lead_status:       result.lead_status,
            auto_status:       result.auto_status,
            buying_signals:    result.buying_signals,
            negative_signals:  result.negative_signals,
            score_breakdown:   result.score_breakdown,
            scoring_reasoning: result.scoring_reasoning,
            last_activity_at:  lead.last_message_at ?? lead.created_at,
          })
          .eq('id', lead.id);

        if (updateErr) {
          console.error(`  ⚠️  Write error for ${lead.id}:`, updateErr.message);
          errors++;
        } else {
          scored++;
        }
      } else {
        scored++;
      }
    } catch (err) {
      console.error(`  ⚠️  Error for lead ${lead.id}:`, err.message);
      errors++;
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(`\n✅ Done${dryRun ? ' (dry run — nothing written)' : ''}`);
  console.log(`   Leads processed : ${scored}`);
  console.log(`   Skipped (no msgs): ${skipped}`);
  console.log(`   Errors           : ${errors}`);

  // Score distribution
  const dist = { new: 0, cold: 0, warm: 0, hot: 0, qualified: 0, lost: 0, converted: 0 };
  for (const { result } of results) dist[result.lead_status] = (dist[result.lead_status] || 0) + 1;
  console.log('\n   Score distribution after backfill:');
  for (const [status, count] of Object.entries(dist)) {
    if (count > 0) console.log(`     ${status.padEnd(12)} : ${count}`);
  }
  console.log('');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
