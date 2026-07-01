import { describe, it, expect } from 'vitest';
import { summarizeStatus, type RecipientResult } from '../src/lib/whatsapp/businessNotify';

function r(overrides: Partial<RecipientResult>): RecipientResult {
  return { phone: '919812345678', role: 'staff', status: 'sent_session', ...overrides };
}

// ═══════════════════════════════════════
// Guaranteed Business Delivery — recipient-outcome summarization
// ═══════════════════════════════════════
describe('summarizeStatus', () => {
  it('no recipients configured — failed', () => {
    expect(summarizeStatus([])).toBe('failed');
  });

  it('all sent via open session — sent_session', () => {
    expect(summarizeStatus([r({ status: 'sent_session' }), r({ status: 'sent_session', role: 'manager' })]))
      .toBe('sent_session');
  });

  it('all sent via template fallback — sent_template', () => {
    expect(summarizeStatus([r({ status: 'sent_template' }), r({ status: 'sent_template', role: 'manager' })]))
      .toBe('sent_template');
  });

  it('mixed session + template success — sent_template (at least one used a template)', () => {
    expect(summarizeStatus([r({ status: 'sent_session' }), r({ status: 'sent_template', role: 'manager' })]))
      .toBe('sent_template');
  });

  it('one recipient succeeds, one fails — partially_sent (never re-attempts the successful one)', () => {
    expect(summarizeStatus([r({ status: 'sent_session' }), r({ status: 'failed', role: 'manager', error: 'timeout' })]))
      .toBe('partially_sent');
  });

  it('all fail with a generic error — failed', () => {
    expect(summarizeStatus([r({ status: 'failed', error: 'network error' })])).toBe('failed');
  });

  it('all fail specifically because no fallback template is bound — no_template', () => {
    expect(summarizeStatus([
      r({ status: 'failed', no_fallback_template: true }),
      r({ status: 'failed', role: 'manager', no_fallback_template: true }),
    ])).toBe('no_template');
  });

  it('mixed failure reasons (one no-template, one generic) — failed, not no_template', () => {
    expect(summarizeStatus([
      r({ status: 'failed', no_fallback_template: true }),
      r({ status: 'failed', role: 'manager', error: 'network error' }),
    ])).toBe('failed');
  });
});
