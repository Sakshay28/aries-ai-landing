// Pure, dependency-free automation logic: condition gating (L6), A/B variant
// selection (L7), and Meta 24h-window error classification (L10). Kept separate
// from engine.ts (which pulls in Supabase/Meta/Redis) so every branch here is
// unit-testable without a DB or network.

import { createHash } from 'crypto';

// ═══════════════════════════════════════
// L6 — Conditional send gating
// ═══════════════════════════════════════

export type ConditionOperator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_empty' | 'is_not_empty';

export interface ConditionRule {
  variable: string;            // a known template variable name, e.g. "guest_count"
  operator: ConditionOperator;
  value?: string;              // compared against; unused for is_empty/is_not_empty
}

export interface ConditionGroup {
  match: 'all' | 'any';        // AND / OR across rules
  rules: ConditionRule[];
}

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string; needsValue: boolean }[] = [
  { value: 'eq',           label: 'equals',          needsValue: true  },
  { value: 'neq',          label: 'does not equal',  needsValue: true  },
  { value: 'contains',     label: 'contains',        needsValue: true  },
  { value: 'not_contains', label: 'does not contain', needsValue: true },
  { value: 'gt',           label: 'is greater than',  needsValue: true },
  { value: 'gte',          label: 'is at least',      needsValue: true },
  { value: 'lt',           label: 'is less than',     needsValue: true },
  { value: 'lte',          label: 'is at most',       needsValue: true },
  { value: 'is_empty',     label: 'is empty',         needsValue: false },
  { value: 'is_not_empty', label: 'is not empty',     needsValue: false },
];

function asNumber(s: string | undefined): number | null {
  if (s === undefined || s === null) return null;
  // Pull the first numeric token so "4 guests" → 4, "₹500" → 500.
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function evalRule(rule: ConditionRule, vars: Record<string, string>): boolean {
  const raw = vars[rule.variable];
  const actual = (raw ?? '').trim();
  const expected = (rule.value ?? '').trim();

  switch (rule.operator) {
    case 'eq':           return actual.toLowerCase() === expected.toLowerCase();
    case 'neq':          return actual.toLowerCase() !== expected.toLowerCase();
    case 'contains':     return actual.toLowerCase().includes(expected.toLowerCase());
    case 'not_contains': return !actual.toLowerCase().includes(expected.toLowerCase());
    case 'is_empty':     return actual === '';
    case 'is_not_empty': return actual !== '';
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === null || b === null) return false; // non-numeric → comparison can't hold
      if (rule.operator === 'gt')  return a > b;
      if (rule.operator === 'gte') return a >= b;
      if (rule.operator === 'lt')  return a < b;
      return a <= b;
    }
    default: return true; // unknown operator → don't block the send
  }
}

/**
 * Evaluate a condition group against resolved variables.
 * No conditions (null/empty) → always passes (backward compatible).
 */
export function evaluateConditions(
  group: ConditionGroup | null | undefined,
  vars: Record<string, string>,
): { passed: boolean; reason?: string } {
  if (!group || !Array.isArray(group.rules) || group.rules.length === 0) {
    return { passed: true };
  }
  const results = group.rules.map(r => ({ rule: r, ok: evalRule(r, vars) }));
  const passed = group.match === 'any'
    ? results.some(r => r.ok)
    : results.every(r => r.ok);

  if (passed) return { passed: true };

  const failed = results.filter(r => !r.ok).map(r => {
    const v = vars[r.rule.variable] ?? '';
    return `${r.rule.variable}(="${v}") ${r.rule.operator}${r.rule.value !== undefined ? ` "${r.rule.value}"` : ''}`;
  });
  return { passed: false, reason: `${group.match === 'any' ? 'no condition matched' : 'condition failed'}: ${failed.join(', ')}` };
}

// ═══════════════════════════════════════
// L7 — A/B variant selection (deterministic)
// ═══════════════════════════════════════

/** Stable 0–99 bucket for a key (same key → same bucket, every run). */
export function hashToPercent(key: string): number {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 100;
}

export interface VariantInput {
  message_text: string;
  message_text_b?: string | null;
  ab_split_percent?: number | null;
}

/**
 * Pick A or B deterministically by hashing a stable key (lead phone/id) so the
 * same recipient always sees the same variant and re-triggers are idempotent.
 * Returns variant=null when A/B is not configured.
 */
export function pickVariant(
  rule: VariantInput,
  stableKey: string,
): { text: string; variant: 'A' | 'B' | null } {
  const split = rule.ab_split_percent ?? 0;
  if (!rule.message_text_b || split <= 0) {
    return { text: rule.message_text, variant: null };
  }
  const bucket = hashToPercent(stableKey);
  return bucket < split
    ? { text: rule.message_text_b, variant: 'B' }
    : { text: rule.message_text, variant: 'A' };
}

// ═══════════════════════════════════════
// L10 — 24h-window error classification
// ═══════════════════════════════════════

// Meta code 131047: "Message failed to send because more than 24 hours have
// passed since the customer last replied." Free-form messages are blocked;
// only an approved template can reach the customer. Retrying is futile, so the
// engine marks these failed (not retried) and alerts the operator.
export function isWindowClosedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: number }).code;
  if (code === 131047) return true;
  const msg = (err as { message?: string }).message || '';
  return /\b131047\b|24 hours have passed|re-?engagement message/i.test(msg);
}
