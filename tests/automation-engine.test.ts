import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  resolveBookingVariables,
  formatDate,
  formatTime,
  VARIABLE_REGISTRY,
  KNOWN_VARIABLE_NAMES,
  SAMPLE_VARIABLES,
  validateTemplate,
} from '../src/lib/automations/variables';

// Direct import of the renderTemplate logic (extracted for testability)
// We test the template rendering and validation that the engine uses.

function renderTemplate(
  text: string,
  vars: Record<string, string>,
): { rendered: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const rendered = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    if (val === undefined || val === null) {
      unresolved.push(key);
      return match;
    }
    return val;
  });
  return { rendered, unresolved };
}

function hasBrokenLines(message: string): boolean {
  return /📅\s+at\b/.test(message) || /👥\s+guests?\b/.test(message) || /🆔\s*Ref:\s*$/.test(message);
}

const NEO_TEMPLATE =
  'Hey {{customer_name}}! 🎉\n\nYour table at NEO Lounge is locked in! ✅\n\n' +
  '📅 {{booking_date}} at {{booking_time}}\n👥 {{party_size}} guests\n🆔 Ref: {{reservation_id}}\n\n' +
  'We\'re getting your vibe ready 🥂🎶\n\n' +
  '📸 Follow us on Instagram:\n👉 https://www.instagram.com/neojaipur/';

describe('Automation Template Rendering', () => {
  it('renders all variables correctly with complete data', () => {
    const vars = {
      customer_name: 'Himanshu Gupta',
      booking_date: 'Sat, 28 Jun 2026',
      booking_time: '8:00 PM',
      party_size: '4',
      reservation_id: 'RES-20260626-5544',
      business_name: 'NEO Lounge',
    };
    const { rendered, unresolved } = renderTemplate(NEO_TEMPLATE, vars);
    expect(unresolved).toEqual([]);
    expect(rendered).toContain('Hey Himanshu Gupta!');
    expect(rendered).toContain('📅 Sat, 28 Jun 2026 at 8:00 PM');
    expect(rendered).toContain('👥 4 guests');
    expect(rendered).toContain('🆔 Ref: RES-20260626-5544');
  });

  it('detects unresolved variables and returns them', () => {
    const vars = {
      customer_name: 'Himanshu Gupta',
      business_name: 'NEO Lounge',
    };
    const { rendered, unresolved } = renderTemplate(NEO_TEMPLATE, vars);
    expect(unresolved).toEqual(['booking_date', 'booking_time', 'party_size', 'reservation_id']);
    expect(rendered).toContain('{{booking_date}}');
  });

  it('detects empty-string variables as resolved (not unresolved)', () => {
    const vars = {
      customer_name: 'Himanshu Gupta',
      booking_date: '',
      booking_time: '',
      party_size: '',
      reservation_id: '',
      business_name: 'NEO Lounge',
    };
    const { unresolved } = renderTemplate(NEO_TEMPLATE, vars);
    expect(unresolved).toEqual([]);
  });

  it('handles template with no variables', () => {
    const { rendered, unresolved } = renderTemplate('Hello, welcome!', {});
    expect(rendered).toBe('Hello, welcome!');
    expect(unresolved).toEqual([]);
  });

  it('handles extra variables that are not in the template', () => {
    const { rendered, unresolved } = renderTemplate('Hi {{customer_name}}!', {
      customer_name: 'Test',
      extra_field: 'ignored',
    });
    expect(rendered).toBe('Hi Test!');
    expect(unresolved).toEqual([]);
  });
});

describe('Broken Message Detection', () => {
  it('detects "📅 at" with no date', () => {
    expect(hasBrokenLines('📅 at 8:00 PM')).toBe(true);
  });

  it('detects "👥 guests" with no count', () => {
    expect(hasBrokenLines('👥 guests')).toBe(true);
  });

  it('detects "🆔 Ref:" with no ID', () => {
    expect(hasBrokenLines('🆔 Ref:')).toBe(true);
  });

  it('does NOT flag valid messages', () => {
    expect(hasBrokenLines('📅 Sat, 28 Jun 2026 at 8:00 PM')).toBe(false);
    expect(hasBrokenLines('👥 4 guests')).toBe(false);
    expect(hasBrokenLines('🆔 Ref: RES-20260626-5544')).toBe(false);
  });

  it('does NOT flag messages without booking patterns', () => {
    expect(hasBrokenLines('Hello, welcome to our restaurant!')).toBe(false);
  });
});

describe('Variable Resolution from Webhook', () => {
  it('uses prettyDate format not raw DB date', () => {
    const bookingDate = '2026-06-28';
    const prettyDate = (() => {
      const d = new Date(`${bookingDate}T00:00:00`);
      return isNaN(d.getTime())
        ? bookingDate
        : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    })();
    expect(prettyDate).not.toBe('2026-06-28');
    expect(prettyDate).toMatch(/Sun/);
    expect(prettyDate).toMatch(/28/);
    expect(prettyDate).toMatch(/Jun/);
    expect(prettyDate).toMatch(/2026/);
  });

  it('uses 12-hour time format not raw slot_time', () => {
    const slotTime = '20:00:00';
    const [h, m] = slotTime.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 === 0 ? 12 : hr % 12;
    const prettyTime = `${hr12}:${m} ${ampm}`;
    expect(prettyTime).toBe('8:00 PM');
    expect(prettyTime).not.toBe('20:00:00');
  });

  it('formats guest count with plural', () => {
    const guestCount: number = 4;
    const guestLabel = `${guestCount} guest${guestCount !== 1 ? 's' : ''}`;
    expect(guestLabel).toBe('4 guests');
  });

  it('formats guest count singular', () => {
    const guestCount = 1;
    const guestLabel = `${guestCount} guest${guestCount !== 1 ? 's' : ''}`;
    expect(guestLabel).toBe('1 guest');
  });

  it('end-to-end: rendered message matches expected output', () => {
    const bookingDate = '2026-06-28';
    const slotTime = '20:00:00';
    const guestCount: number = 4;

    const prettyDate = (() => {
      const d = new Date(`${bookingDate}T00:00:00`);
      return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    })();
    const [h, m] = slotTime.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr % 12 === 0 ? 12 : hr % 12;
    const prettyTime = `${hr12}:${m} ${ampm}`;
    const guestLabel = `${guestCount} guest${guestCount !== 1 ? 's' : ''}`;

    const vars = {
      customer_name: 'Himanshu Gupta',
      business_name: 'NEO Lounge',
      reservation_id: 'RES-20260626-5544',
      booking_date: prettyDate,
      booking_time: prettyTime,
      party_size: String(guestCount),
      guest_count: guestLabel,
      date: prettyDate,
      time: prettyTime,
    };

    const { rendered, unresolved } = renderTemplate(NEO_TEMPLATE, vars);
    expect(unresolved).toEqual([]);
    expect(hasBrokenLines(rendered)).toBe(false);
    expect(rendered).toContain('8:00 PM');
    expect(rendered).toContain('4 guests');
    expect(rendered).toContain('RES-20260626-5544');
    expect(rendered).not.toContain('{{');
  });
});

// ═══════════════════════════════════════
// Variable Resolver Tests
// ═══════════════════════════════════════

describe('Variable Resolver', () => {
  it('resolves all required variables from booking context', () => {
    const vars = resolveBookingVariables(
      {
        customerName: 'Ravi Kumar',
        customerPhone: '+919876543210',
        guestCount: 6,
        bookingDate: '2026-07-15',
        slotTime: '19:30:00',
        reservationId: 'RES-20260715-0001',
        tableName: 'VIP-1',
        specialRequests: 'Birthday cake',
      },
      { business_name: 'Spice Garden', business_phone: '+911234567890', business_address: '456 MG Road' },
    );

    expect(vars.customer_name).toBe('Ravi Kumar');
    expect(vars.first_name).toBe('Ravi');
    expect(vars.booking_date).toMatch(/Jul/);
    expect(vars.booking_time).toBe('7:30 PM');
    expect(vars.guest_count).toBe('6 guests');
    expect(vars.party_size).toBe('6');
    expect(vars.reservation_id).toBe('RES-20260715-0001');
    expect(vars.table).toBe('Table VIP-1');
    expect(vars.table_number).toBe('VIP-1');
    expect(vars.special_requests).toBe('Birthday cake');
    expect(vars.business_name).toBe('Spice Garden');
    expect(vars.restaurant_name).toBe('Spice Garden');
  });

  it('uses fallback for missing customer name', () => {
    const vars = resolveBookingVariables(
      { customerName: '', customerPhone: '123', guestCount: 2, bookingDate: '2026-01-01', slotTime: '12:00:00', reservationId: 'R1' },
      { business_name: 'Test' },
    );
    expect(vars.customer_name).toBe('there');
    expect(vars.first_name).toBe('there');
  });

  it('handles singular guest count', () => {
    const vars = resolveBookingVariables(
      { customerName: 'A', customerPhone: '1', guestCount: 1, bookingDate: '2026-01-01', slotTime: '12:00:00', reservationId: 'R' },
      { business_name: 'B' },
    );
    expect(vars.guest_count).toBe('1 guest');
  });

  it('formatDate handles various date formats', () => {
    expect(formatDate('2026-12-25')).toMatch(/25/);
    expect(formatDate('2026-12-25')).toMatch(/Dec/);
    expect(formatDate('')).toBe('');
    expect(formatDate('invalid')).toBe('invalid');
  });

  it('formatTime converts 24h to 12h', () => {
    expect(formatTime('08:30:00')).toBe('8:30 AM');
    expect(formatTime('12:00:00')).toBe('12:00 PM');
    expect(formatTime('00:00:00')).toBe('12:00 AM');
    expect(formatTime('23:45:00')).toBe('11:45 PM');
    expect(formatTime('')).toBe('');
  });

  it('registry covers all required booking variables', () => {
    const requiredNames = VARIABLE_REGISTRY
      .filter((v: any) => v.required)
      .map((v: any) => v.name);
    expect(requiredNames).toContain('customer_name');
    expect(requiredNames).toContain('booking_date');
    expect(requiredNames).toContain('booking_time');
    expect(requiredNames).toContain('guest_count');
    expect(requiredNames).toContain('reservation_id');
    expect(requiredNames).toContain('business_name');
  });

  it('KNOWN_VARIABLE_NAMES matches registry', () => {
    expect(KNOWN_VARIABLE_NAMES.size).toBe(VARIABLE_REGISTRY.length);
    for (const v of VARIABLE_REGISTRY) {
      expect(KNOWN_VARIABLE_NAMES.has(v.name)).toBe(true);
    }
  });

  it('sample data has entries for all registry variables', () => {
    for (const v of VARIABLE_REGISTRY) {
      expect(SAMPLE_VARIABLES).toHaveProperty(v.name);
    }
  });
});

// ═══════════════════════════════════════
// Template Validation Tests
// ═══════════════════════════════════════

describe('Template Validation', () => {
  it('accepts template with only known variables', () => {
    const result = validateTemplate('Hi {{customer_name}}, your booking on {{booking_date}} is confirmed!');
    expect(result.valid).toBe(true);
    expect(result.unknownVariables).toEqual([]);
  });

  it('rejects template with unknown variables', () => {
    const result = validateTemplate('Hi {{customr_name}}!');
    expect(result.valid).toBe(false);
    expect(result.unknownVariables).toContain('customr_name');
  });

  it('suggests corrections for typos', () => {
    const result = validateTemplate('{{bookingdate}} {{cusomer_name}}');
    expect(result.suggestions).toHaveProperty('bookingdate');
    expect(result.suggestions.bookingdate).toBe('booking_date');
    expect(result.suggestions).toHaveProperty('cusomer_name');
    expect(result.suggestions.cusomer_name).toBe('customer_name');
  });

  it('accepts template with no variables', () => {
    const result = validateTemplate('Hello, welcome to our restaurant!');
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════
// Idempotency Key Tests
// ═══════════════════════════════════════

describe('Idempotency Key Generation', () => {
  function generateIdempotencyKey(automationId: string, leadId: string, scheduledAt: string): string {
    return createHash('sha256')
      .update(`${automationId}:${leadId}:${scheduledAt}`)
      .digest('hex')
      .slice(0, 32);
  }

  it('generates deterministic keys', () => {
    const key1 = generateIdempotencyKey('auto-1', 'lead-1', '2026-06-28T10:00:00Z');
    const key2 = generateIdempotencyKey('auto-1', 'lead-1', '2026-06-28T10:00:00Z');
    expect(key1).toBe(key2);
  });

  it('generates different keys for different inputs', () => {
    const key1 = generateIdempotencyKey('auto-1', 'lead-1', '2026-06-28T10:00:00Z');
    const key2 = generateIdempotencyKey('auto-1', 'lead-2', '2026-06-28T10:00:00Z');
    const key3 = generateIdempotencyKey('auto-2', 'lead-1', '2026-06-28T10:00:00Z');
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('generates 32-char hex string', () => {
    const key = generateIdempotencyKey('auto-1', 'lead-1', '2026-06-28T10:00:00Z');
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});
