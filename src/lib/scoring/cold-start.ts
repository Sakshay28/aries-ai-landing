// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Cold-Start Baseline Scorer
//
// The conversation-driven engine (lead-scoring-engine + conversation-intelligence)
// needs messages to work. Imported / cold leads have NONE — which is why they used
// to sit at score=0 / status='new' forever.
//
// This module gives every lead a DETERMINISTIC baseline the moment it enters the
// system, derived only from the metadata we already have (name, email, source,
// notes, relationship history). No AI, no DB, no network — pure and unit-testable.
//
// Principles (consistent with the main engine):
//   - Rules only. Same multi-language (English + Hindi/Hinglish) intent patterns.
//   - Every point is explainable — each signal carries a label + reason.
//   - QUALIFIED is a gated status: metadata alone can never auto-qualify a lead.
//     Cold-start therefore caps at 'hot'. A closing signal in a real conversation
//     is still required for 'qualified' (see UNIVERSAL_QUALIFICATION_GATES).
//   - Opt-out / spam short-circuits to a terminal status regardless of other points.
// ═══════════════════════════════════════════════════════════════════════════

import type { LeadStatus } from '@/lib/types';

export interface ColdStartInput {
  name?:              string | null;
  email?:             string | null;
  phone?:             string | null;
  notes?:             string | null;
  /** e.g. 'csv_import', 'referral', 'walk_in', 'meta_ads', 'website_form' */
  source?:            string | null;
  channel?:           string | null;
  isRepeatCustomer?:  boolean | null;
  pastBookingsCount?: number | null;
  birthday?:          string | null;
}

export interface ColdStartBreakdownEntry {
  key:    string;
  label:  string;
  points: number;
}

export interface ColdStartResult {
  /** 0-100 deterministic baseline score. */
  score:     number;
  /** Status mapped from the score band. Never 'qualified'/'converted' from metadata. */
  status:    LeadStatus;
  /** buying_signals keys that fired — feeds the leads.buying_signals column. */
  signals:   string[];
  breakdown: ColdStartBreakdownEntry[];
  /** Human-readable "why" — powers the AI Insights card / audit timeline. */
  reason:    string;
}

// ── Metadata-driven intent patterns ────────────────────────────────────────
// A trimmed, cold-start-appropriate subset of the engine's patterns. Scans the
// free-text `notes` field an operator typed at import time (e.g. from a spreadsheet
// column "wants to book anniversary dinner for 4 next Friday").
interface Pattern {
  key:      string;
  label:    string;
  points:   number;
  patterns: RegExp[];
}

const POSITIVE_NOTE_PATTERNS: Pattern[] = [
  {
    key: 'requested_booking',
    label: 'Notes mention a booking / reservation request',
    points: 20,
    patterns: [
      /\b(book|booking|reserve|reservation|reserved|table for|need (a )?table|need (a )?room|appointment|appoint)\b/i,
      /\b(booking karni|table chahiye|room chahiye|reserve karna)\b/i,
    ],
  },
  {
    key: 'asked_pricing',
    label: 'Notes mention pricing / budget',
    points: 10,
    patterns: [
      /\b(price|pricing|cost|charges?|fees?|rate|quote|package|budget|how much)\b/i,
      /\b(kitna|kitne mein|daam|paisa|rate kya|price kya)\b/i,
    ],
  },
  {
    key: 'asked_availability',
    label: 'Notes mention dates / availability',
    points: 10,
    patterns: [
      /\b(available|availability|slot|seats?|when|date|schedule|timing)\b/i,
      /\b(kab|konsa din|kitne baje|available hai)\b/i,
    ],
  },
  {
    key: 'occasion_mentioned',
    label: 'Notes mention a special occasion',
    points: 8,
    patterns: [
      /\b(birthday|anniversary|wedding|party|celebration|corporate|event|reception|engagement)\b/i,
      /\b(shaadi|sagai|salgirah|jashn)\b/i,
    ],
  },
  {
    key: 'urgency_signal',
    label: 'Notes convey urgency',
    points: 8,
    patterns: [
      /\b(today|tonight|tomorrow|asap|urgent|right away|this weekend|weekend)\b/i,
      /\b(aaj|aj|kal|abhi|turant|jaldi)\b/i,
    ],
  },
  {
    key: 'explicit_interest',
    label: 'Notes express explicit interest',
    points: 10,
    patterns: [
      /\b(interested|want to (visit|come|book|order)|planning to|looking for|enquir|inquir|call me back|callback)\b/i,
      /\b(interested hun|aana chahta|aana chahti|visit karna)\b/i,
    ],
  },
];

// Negative / terminal signals — these short-circuit or heavily penalise.
const OPT_OUT_PATTERN =
  /\b(unsubscribe|opt out|opt-out|do not (contact|message|call)|don'?t (contact|message|call)|stop messaging|remove me|wrong number|dnd)\b/i;
const NOT_INTERESTED_PATTERN =
  /\b(not interested|no interest|already booked|found (someone|somewhere) else|going elsewhere|not now|nahi chahiye|mana kar diya)\b/i;
const SPAM_PATTERN = /\b(spam|fake|test entry|do not use)\b/i;

// ── Source quality — how much intrinsic intent the acquisition channel implies ──
function sourcePoints(source: string | null | undefined, channel: string | null | undefined): ColdStartBreakdownEntry {
  const s = `${source ?? ''} ${channel ?? ''}`.toLowerCase();

  // Warm inbound / referral — someone chose to reach out or was vouched for.
  if (/\b(referral|refer|word of mouth|walk[_\s-]?in|repeat|vip)\b/.test(s)) {
    return { key: 'source_referral', label: 'High-intent source (referral / walk-in)', points: 12 };
  }
  // Paid lead forms — explicit hand-raise, but colder than a referral.
  if (/\b(meta[_\s-]?ads?|facebook|instagram|google[_\s-]?ads?|\bads?\b|campaign|lead[_\s-]?form|landing)\b/.test(s)) {
    return { key: 'source_paid_lead', label: 'Paid lead form (hand-raiser)', points: 10 };
  }
  // Owned inbound channels.
  if (/\b(website|web[_\s-]?form|enquiry|inquiry|contact[_\s-]?form|whatsapp|dm|chat)\b/.test(s)) {
    return { key: 'source_inbound', label: 'Inbound enquiry channel', points: 8 };
  }
  // Offline capture with some intent.
  if (/\b(event|expo|exhibition|booth|scan|qr)\b/.test(s)) {
    return { key: 'source_event', label: 'Captured at an event', points: 6 };
  }
  // Bulk / unknown — a known contact, but no acquisition intent implied.
  return { key: 'source_list', label: 'Imported contact (bulk list)', points: 2 };
}

// ── Score → status band ─────────────────────────────────────────────────────
// Aligned with the engine's SCORE_THRESHOLDS, extended with 'new'/'interested'
// bands that matter at the cold end where imports live. Capped at 'hot'.
export function coldStartStatus(score: number): LeadStatus {
  if (score >= 70) return 'hot';
  if (score >= 55) return 'warm';
  if (score >= 35) return 'interested';
  if (score >= 15) return 'new';
  return 'cold';
}

const MAX_COLD_START_SCORE = 89; // never reach the 90+ qualified band from metadata

/**
 * Compute a deterministic baseline score/status/signals for a lead that has no
 * conversation yet. Safe to call on every import row — pure and side-effect free.
 */
export function computeColdStartBaseline(input: ColdStartInput): ColdStartResult {
  const breakdown: ColdStartBreakdownEntry[] = [];
  const signals: string[] = [];
  const notes = (input.notes ?? '').trim();

  const add = (entry: ColdStartBreakdownEntry) => {
    breakdown.push(entry);
    if (entry.points > 0) signals.push(entry.key);
  };

  // ── Terminal short-circuits (checked before anything else) ────────────────
  if (notes && SPAM_PATTERN.test(notes)) {
    return {
      score: 0,
      status: 'cold',
      signals: ['spam_flagged'],
      breakdown: [{ key: 'spam_flagged', label: 'Flagged as spam / test in notes', points: -100 }],
      reason: 'Flagged as spam or test entry in notes',
    };
  }
  if (notes && OPT_OUT_PATTERN.test(notes)) {
    return {
      score: 0,
      status: 'lost',
      signals: ['opted_out'],
      breakdown: [{ key: 'opted_out', label: 'Opt-out / do-not-contact in notes', points: -100 }],
      reason: 'Opt-out or do-not-contact request in notes',
    };
  }

  // ── Data completeness ─────────────────────────────────────────────────────
  const hasRealName = !!input.name && input.name.trim().length > 0 && input.name.trim() !== (input.phone ?? '').trim();
  if (hasRealName) add({ key: 'has_name', label: 'Has a real name', points: 4 });
  if (input.email && input.email.trim().length > 0) add({ key: 'has_email', label: 'Has an email address', points: 6 });
  if (input.birthday && input.birthday.trim().length > 0) add({ key: 'has_birthday', label: 'Has a birthday on file', points: 3 });

  // ── Source quality ────────────────────────────────────────────────────────
  add(sourcePoints(input.source, input.channel));

  // ── Relationship history ──────────────────────────────────────────────────
  if (input.isRepeatCustomer) add({ key: 'returning_customer', label: 'Returning customer', points: 12 });
  const past = input.pastBookingsCount ?? 0;
  if (past > 1) add({ key: 'repeated_visits', label: `Repeat visits (${past} bookings)`, points: 10 });
  else if (past === 1) add({ key: 'prior_booking', label: 'Has one prior booking', points: 6 });

  // ── Notes intent scan (each signal fires at most once) ────────────────────
  if (notes) {
    for (const p of POSITIVE_NOTE_PATTERNS) {
      if (p.patterns.some((re) => re.test(notes))) {
        add({ key: p.key, label: p.label, points: p.points });
      }
    }
  }

  // ── Soft negative: explicit "not interested" in notes ─────────────────────
  const notInterested = notes && NOT_INTERESTED_PATTERN.test(notes);
  if (notInterested) breakdown.push({ key: 'noted_not_interested', label: 'Notes mention not interested / already booked', points: -25 });

  // ── Tally ─────────────────────────────────────────────────────────────────
  const raw = breakdown.reduce((sum, e) => sum + e.points, 0);
  const score = Math.max(0, Math.min(MAX_COLD_START_SCORE, raw));

  let status = coldStartStatus(score);
  // An explicit "not interested" note pins the lead cold even if metadata is rich.
  if (notInterested && score < 35) status = 'cold';

  const positives = breakdown.filter((e) => e.points > 0).map((e) => e.label);
  const negatives = breakdown.filter((e) => e.points < 0).map((e) => e.label);
  const reason =
    [...positives.map((l) => `✓ ${l}`), ...negatives.map((l) => `✗ ${l}`)].join('; ') ||
    'Imported contact — no signals yet';

  return { score, status, signals, breakdown, reason };
}
