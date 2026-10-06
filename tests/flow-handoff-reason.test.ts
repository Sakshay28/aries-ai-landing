import { describe, it, expect } from 'vitest';
import { handoffAlertReason } from '../src/lib/flows/engine';

// A handoff node's staff alert used to always read "Flow completed (handoff
// initiated)", so staff learned nothing the flow had collected without
// opening the chat. data.reason now carries an interpolated summary.

const ctx = {
  leadName: 'Rahul Sharma',
  phone: '919876543210',
  messageText: '✅ Yes, Book My Slot',
  variables: { travel_date: '12 Oct', group_size: '3-5 People', from_city: 'Delhi' },
};

describe('handoffAlertReason', () => {
  it('keeps the generic reason when the node sets none', () => {
    expect(handoffAlertReason(undefined, ctx)).toBe('Flow completed (handoff initiated)');
    expect(handoffAlertReason('   ', ctx)).toBe('Flow completed (handoff initiated)');
    expect(handoffAlertReason(42, ctx)).toBe('Flow completed (handoff initiated)');
  });

  it('interpolates collected flow variables into the reason', () => {
    expect(handoffAlertReason('36 KM — BOOK | Date: {{travel_date}} | Group: {{group_size}} | From: {{from_city}}', ctx))
      .toBe('36 KM — BOOK | Date: 12 Oct | Group: 3-5 People | From: Delhi');
  });

  it('resolves the built-in {{phone}} and {{message}} placeholders', () => {
    expect(handoffAlertReason('{{phone}} tapped {{message}}', ctx)).toBe('919876543210 tapped ✅ Yes, Book My Slot');
  });

  it('shows "—" for a variable the flow never collected instead of raw braces', () => {
    expect(handoffAlertReason('Date: {{travel_date}} | Budget: {{budget}}', ctx)).toBe('Date: 12 Oct | Budget: —');
  });
});
