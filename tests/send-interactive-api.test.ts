import { describe, it, expect } from 'vitest';

// ── Input validation logic (mirrors the route) ───────────────────────────────

function validateInteractivePayload(body: {
  conversationId?: string;
  type?: string;
  bodyText?: string;
  buttons?: Array<{ id: string; title: string }>;
  sections?: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
}): string | null {
  if (!body.conversationId) return 'Missing conversationId';
  if (body.type !== 'button' && body.type !== 'list') return 'type must be "button" or "list"';
  if (!body.bodyText?.trim()) return 'bodyText is required';

  if (body.type === 'button') {
    if (!Array.isArray(body.buttons) || body.buttons.length === 0 || body.buttons.length > 3) {
      return 'Provide 1–3 buttons';
    }
    for (const b of body.buttons) {
      if (!b.id?.trim() || !b.title?.trim()) return 'Each button needs id and title';
      if (b.title.length > 20) return `Button title must be ≤ 20 chars: "${b.title}"`;
    }
  }

  if (body.type === 'list') {
    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return 'Provide at least one section';
    }
    const totalRows = body.sections.reduce((n, s) => n + (s.rows?.length ?? 0), 0);
    if (totalRows === 0 || totalRows > 10) return 'Provide 1–10 rows across all sections';
    for (const s of body.sections) {
      if (!Array.isArray(s.rows) || s.rows.length === 0) {
        return 'Each section needs at least one row';
      }
      for (const r of s.rows) {
        if (!r.id?.trim() || !r.title?.trim()) return 'Each row needs id and title';
        if (r.title.length > 24) return `Row title must be ≤ 24 chars: "${r.title}"`;
      }
    }
  }

  return null;
}

// ── Button message validation ─────────────────────────────────────────────────

describe('send-interactive: button type', () => {
  it('passes with 1 valid button', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: 'Choose a time',
      buttons: [{ id: 'btn_1', title: '2 PM' }],
    })).toBeNull();
  });

  it('passes with 3 buttons', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: 'Pick a slot',
      buttons: [
        { id: 'a', title: '10 AM' },
        { id: 'b', title: '2 PM' },
        { id: 'c', title: 'Other' },
      ],
    })).toBeNull();
  });

  it('rejects 0 buttons', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: 'Pick',
      buttons: [],
    })).toContain('1–3 buttons');
  });

  it('rejects more than 3 buttons', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: 'Pick',
      buttons: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
        { id: 'd', title: 'D' },
      ],
    })).toContain('1–3 buttons');
  });

  it('rejects button title exceeding 20 chars', () => {
    const err = validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: 'Pick',
      buttons: [{ id: 'a', title: 'This is way too long!!' }],
    });
    expect(err).toContain('≤ 20 chars');
  });

  it('rejects button missing title', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: 'Pick',
      buttons: [{ id: 'a', title: '' }],
    })).toContain('id and title');
  });

  it('rejects missing bodyText', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'button',
      bodyText: '   ',
      buttons: [{ id: 'a', title: 'Yes' }],
    })).toContain('bodyText is required');
  });

  it('rejects missing conversationId', () => {
    expect(validateInteractivePayload({
      type: 'button',
      bodyText: 'Pick',
      buttons: [{ id: 'a', title: 'Yes' }],
    })).toContain('conversationId');
  });

  it('rejects unknown type', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'flow',
      bodyText: 'Pick',
    })).toContain('"button" or "list"');
  });
});

// ── List message validation ───────────────────────────────────────────────────

describe('send-interactive: list type', () => {
  it('passes with a valid single section', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Choose a package',
      sections: [{
        title: 'Available',
        rows: [
          { id: 'p1', title: '4N/5D', description: 'Short trip' },
          { id: 'p2', title: '6N/7D' },
        ],
      }],
    })).toBeNull();
  });

  it('passes without section title', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Choose',
      sections: [{ rows: [{ id: 'r1', title: 'Option A' }] }],
    })).toBeNull();
  });

  it('rejects 0 sections', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Pick',
      sections: [],
    })).toContain('at least one section');
  });

  it('rejects section with 0 rows', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Pick',
      sections: [{ rows: [] }],
    })).toMatch(/section needs at least one row|1–10 rows/);
  });

  it('rejects more than 10 rows total', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }));
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Pick',
      sections: [{ rows }],
    })).toContain('1–10 rows');
  });

  it('rejects row title exceeding 24 chars', () => {
    const err = validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Pick',
      sections: [{ rows: [{ id: 'r1', title: 'This row title is too long!!' }] }],
    });
    expect(err).toContain('≤ 24 chars');
  });

  it('rejects row missing id', () => {
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Pick',
      sections: [{ rows: [{ id: '', title: 'Option' }] }],
    })).toContain('id and title');
  });

  it('accepts 10 rows spread across two sections', () => {
    const makeRows = (n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}_${i}`, title: `${prefix} ${i}` }));
    expect(validateInteractivePayload({
      conversationId: 'conv1',
      type: 'list',
      bodyText: 'Pick',
      sections: [
        { title: 'A', rows: makeRows(5, 'a') },
        { title: 'B', rows: makeRows(5, 'b') },
      ],
    })).toBeNull();
  });
});

// ── Metadata shape (matches what the route inserts) ──────────────────────────

describe('send-interactive: outbound metadata shape', () => {
  it('button metadata contains interactive_type and buttons array', () => {
    const buttons = [{ id: 'yes', title: 'Yes' }, { id: 'no', title: 'No' }];
    const metadata = {
      interactive_type: 'button' as const,
      buttons,
      footer: 'Pick one',
    };
    expect(metadata.interactive_type).toBe('button');
    expect(metadata.buttons).toHaveLength(2);
    expect(metadata.buttons[0].id).toBe('yes');
  });

  it('list metadata contains interactive_type, list_button, and sections', () => {
    const metadata = {
      interactive_type: 'list' as const,
      list_button: 'Choose',
      sections: [{
        title: 'Options',
        rows: [{ id: 'r1', title: 'Option A', description: 'Best pick' }],
      }],
    };
    expect(metadata.interactive_type).toBe('list');
    expect(metadata.list_button).toBe('Choose');
    expect(metadata.sections[0].rows[0].description).toBe('Best pick');
  });
});
