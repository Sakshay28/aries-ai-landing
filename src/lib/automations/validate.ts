// Shared server-side validation for automation create/update. Used by both the
// POST and PUT routes so the rules can't drift apart.

import { KNOWN_VARIABLE_NAMES } from '@/lib/automations/variables';
import { CONDITION_OPERATORS, type ConditionGroup, type ConditionRule } from '@/lib/automations/logic';

export const VALID_TRIGGERS = [
  'booking_confirmed', 'booking_reminder', 'new_lead',
  'escalation_triggered', 'escalation_resolved', 'payment_received',
];
export const VALID_UNITS = ['minutes', 'hours', 'days', 'weeks'];

const UNIT_MS: Record<string, number> = {
  minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000,
};

// Hard ceiling on how far out an automation may be scheduled. 90 days covers
// every realistic restaurant flow (reminders, win-backs) while blocking absurd
// values that would park a row in the queue indefinitely.
export const MAX_DELAY_MS = 90 * 86_400_000;

const VALID_OPERATORS = new Set(CONDITION_OPERATORS.map(o => o.value));

/** Returns an error string, or null if the delay is valid. */
export function validateDelay(value: unknown, unit: unknown): string | null {
  if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    return 'delay_value must be a number >= 0';
  }
  if (unit != null && !VALID_UNITS.includes(unit as string)) {
    return `Invalid delay_unit (allowed: ${VALID_UNITS.join(', ')})`;
  }
  const ms = (typeof value === 'number' ? value : 0) * (UNIT_MS[(unit as string) || 'minutes'] || UNIT_MS.minutes);
  if (ms > MAX_DELAY_MS) {
    return `Delay too large — must be at most 90 days`;
  }
  return null;
}

/** Validates the A/B split percentage. Returns error or null. */
export function validateAbSplit(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
    return 'ab_split_percent must be an integer 0–100';
  }
  return null;
}

/** Validates the per-lead daily frequency cap. Returns error or null. */
export function validateFreqCap(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return 'max_per_lead_per_day must be a positive integer (or omitted for unlimited)';
  }
  return null;
}

/**
 * Validates and normalizes a condition group. Returns { value } on success
 * (value is null when there are no usable rules) or { error }.
 */
export function validateConditions(
  raw: unknown,
): { value: ConditionGroup | null; error?: undefined } | { error: string; value?: undefined } {
  if (raw == null) return { value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'conditions must be an object { match, rules }' };
  }
  const group = raw as Partial<ConditionGroup>;
  const match = group.match === 'any' ? 'any' : 'all';
  if (!Array.isArray(group.rules)) return { error: 'conditions.rules must be an array' };

  const rules: ConditionRule[] = [];
  for (const r of group.rules) {
    if (!r || typeof r !== 'object') return { error: 'each condition rule must be an object' };
    const rule = r as Partial<ConditionRule>;
    if (!rule.variable || typeof rule.variable !== 'string') {
      return { error: 'each condition rule needs a variable' };
    }
    if (!KNOWN_VARIABLE_NAMES.has(rule.variable)) {
      return { error: `condition references unknown variable "${rule.variable}"` };
    }
    if (!rule.operator || !VALID_OPERATORS.has(rule.operator)) {
      return { error: `invalid condition operator "${rule.operator}"` };
    }
    const needsValue = CONDITION_OPERATORS.find(o => o.value === rule.operator)?.needsValue;
    if (needsValue && (rule.value == null || String(rule.value).trim() === '')) {
      return { error: `condition "${rule.variable} ${rule.operator}" needs a value` };
    }
    rules.push({
      variable: rule.variable,
      operator: rule.operator,
      value: rule.value != null ? String(rule.value) : undefined,
    });
  }

  if (rules.length === 0) return { value: null };
  return { value: { match, rules } };
}
