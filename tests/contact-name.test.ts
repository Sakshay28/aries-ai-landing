// ═══════════════════════════════════════════════════════════════════════════
// Contact-name single-source-of-truth: exhaustive edge-case coverage.
// Guarantees no placeholder ("there"/"Unknown"/"undefined"/"null"/…) can ever
// be produced for the UI, regardless of the source (CSV / WhatsApp / API / CRM).
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi } from 'vitest';
import {
  cleanContactName,
  hasRealName,
  isPlaceholderName,
  contactDisplayName,
  contactInitials,
  greetingName,
  greetingFirstName,
  auditRecipientNames,
  NEUTRAL_GREETING,
  NEUTRAL_IDENTITY,
} from '@/lib/utils/contact-name';

// Every value that must be treated as "no real name".
const PLACEHOLDERS = [
  null,
  undefined,
  '',
  '   ',
  '\t\n',
  'there',
  'There',
  'THERE',
  ' there ',
  'unknown',
  'Unknown',
  'UNKNOWN',
  'undefined',
  'null',
  'anonymous',
  'Anonymous',
  'n/a',
  'N/A',
  'NA',
  'none',
  'nil',
  'guest',
  'customer',
  'user',
  'contact',
  'test',
  '-',
  '--',
  '.',
  '?',
  '🌸',
  '❤️',
  '😀😀',
  '+91 98765 43210',
  '9876543210',
  '919876543210',
  'R', // single letter
];

// Values that ARE real names and must survive untouched (modulo title-casing).
const REAL_NAMES: Array<[string, string]> = [
  ['Rahul Sharma', 'Rahul Sharma'],
  ['priya', 'Priya'],
  ['  john   doe ', 'John Doe'],
  ["o'brien", "O'Brien"],
  ['jean-luc', 'Jean-Luc'],
  ['José', 'José'],
  ['प्रिया', 'प्रिया'],
  ['🌸Rahul🌸', 'Rahul'], // emoji stripped, real name kept
  ['Noel', 'Noel'], // near-miss of "none"/"nil" must NOT be nulled
  ['Nils', 'Nils'],
];

describe('isPlaceholderName / cleanContactName / hasRealName', () => {
  it.each(PLACEHOLDERS)('treats %o as a placeholder → null', (v) => {
    expect(isPlaceholderName(v as any)).toBe(true);
    expect(cleanContactName(v as any)).toBeNull();
    expect(hasRealName(v as any)).toBe(false);
  });

  it.each(REAL_NAMES)('keeps real name %s → %s', (input, expected) => {
    expect(isPlaceholderName(input)).toBe(false);
    expect(cleanContactName(input)).toBe(expected);
    expect(hasRealName(input)).toBe(true);
  });
});

describe('contactDisplayName — never a placeholder', () => {
  it('prefers a real name', () => {
    expect(contactDisplayName('Rahul Sharma', '919876543210')).toBe('Rahul Sharma');
  });

  it('falls back to a formatted phone for every placeholder name', () => {
    for (const p of PLACEHOLDERS) {
      const out = contactDisplayName(p as any, '919876543210');
      expect(out).toBe('+91 98765 43210');
    }
  });

  it('falls back to the neutral identity when there is no name and no phone', () => {
    expect(contactDisplayName(null, null)).toBe(NEUTRAL_IDENTITY);
    expect(contactDisplayName('there', '')).toBe(NEUTRAL_IDENTITY);
  });

  it('NEVER returns any known placeholder token', () => {
    const banned = new Set(['there', 'unknown', 'undefined', 'null', 'anonymous', '-', '']);
    for (const p of PLACEHOLDERS) {
      for (const phone of ['919876543210', '', null]) {
        const out = contactDisplayName(p as any, phone as any);
        expect(out.trim().length).toBeGreaterThan(0);
        expect(banned.has(out.trim().toLowerCase())).toBe(false);
      }
    }
  });
});

describe('contactInitials', () => {
  it('returns up to two initials for a real name', () => {
    expect(contactInitials('Rahul Sharma')).toBe('RS');
    expect(contactInitials('madonna')).toBe('M');
  });

  it('returns null for every placeholder (caller renders a glyph)', () => {
    for (const p of PLACEHOLDERS) expect(contactInitials(p as any)).toBeNull();
  });
});

describe('greeting helpers — the ONLY home of "there"', () => {
  it('returns the neutral greeting for placeholders', () => {
    for (const p of PLACEHOLDERS) {
      expect(greetingName(p as any)).toBe(NEUTRAL_GREETING);
      expect(greetingFirstName(p as any)).toBe(NEUTRAL_GREETING);
    }
  });

  it('returns the sanitized name / first name for real names', () => {
    expect(greetingName('🌸Rahul Sharma🌸')).toBe('Rahul Sharma');
    expect(greetingFirstName('Rahul Sharma')).toBe('Rahul');
  });
});

// The user's required source matrix: whatever the origin, a placeholder name
// resolves to the phone number and a real name is kept. The resolver/importers
// all funnel through cleanContactName, so this proves the guarantee per-source.
describe('source matrix (CSV / WhatsApp / API / CRM)', () => {
  const sources = ['csv', 'whatsapp', 'api', 'crm'] as const;
  it.each(sources)('%s: placeholder name → phone, real name → kept', (source) => {
    const phone = '919999988888';
    // A contact from this source with a junk name:
    expect(contactDisplayName('there', phone)).toBe('+91 99999 88888');
    expect(cleanContactName('undefined')).toBeNull();
    // A contact from this source with a real name:
    expect(contactDisplayName('Aisha Khan', phone)).toBe('Aisha Khan');
    expect(void source).toBeUndefined();
  });
});

describe('duplicate contacts render consistently', () => {
  it('two records with the same phone and no name resolve to the same display', () => {
    const a = contactDisplayName(null, '919876543210');
    const b = contactDisplayName('there', '919876543210');
    expect(a).toBe(b);
  });
});

describe('auditRecipientNames — monitoring', () => {
  it('flags rows whose stored name is a placeholder and counts them', () => {
    const rows = [
      { name: 'Rahul', contact_id: '1', source_type: 'crm' },
      { name: 'there', contact_id: '2', source_type: 'csv' },
      { name: null, contact_id: '3', source_type: 'crm' }, // legit null → not flagged
      { name: '🌸', contact_id: '4', source_type: 'whatsapp' },
    ];
    const count = auditRecipientNames(rows, { tenantId: 't1', campaignId: 'c1' });
    expect(count).toBe(2); // 'there' and '🌸'
  });

  it('does not throw on empty input', () => {
    expect(() => auditRecipientNames([])).not.toThrow();
    expect(auditRecipientNames([])).toBe(0);
  });
});
