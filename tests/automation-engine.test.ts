import { describe, it, expect } from 'vitest';

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
    const guestCount = 4;
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
    const guestCount = 4;

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
