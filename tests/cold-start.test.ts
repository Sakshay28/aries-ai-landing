import { describe, it, expect } from 'vitest';
import { computeColdStartBaseline, coldStartStatus } from '@/lib/scoring/cold-start';

describe('cold-start baseline scorer', () => {
  it('gives a bare bulk-list contact a low, non-zero baseline (not frozen at new/0)', () => {
    const r = computeColdStartBaseline({ phone: '919000000001', source: 'csv_import' });
    // Only the bulk-list source point fires — small but real, and status 'cold'.
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(15);
    expect(r.status).toBe('cold');
    expect(r.signals).toContain('source_list');
    expect(r.reason).not.toMatch(/no signals/i); // it has at least the source signal
  });

  it('rewards data completeness (name + email + birthday)', () => {
    const bare = computeColdStartBaseline({ phone: '91900', source: 'csv_import' });
    const rich = computeColdStartBaseline({
      name: 'Asha Rao', email: 'asha@example.com', birthday: '1990-05-01', phone: '91900', source: 'csv_import',
    });
    expect(rich.score).toBeGreaterThan(bare.score);
    expect(rich.signals).toEqual(expect.arrayContaining(['has_name', 'has_email', 'has_birthday']));
  });

  it('does not count phone-as-name as a real name', () => {
    const r = computeColdStartBaseline({ name: '919000000001', phone: '919000000001', source: 'csv_import' });
    expect(r.signals).not.toContain('has_name');
  });

  it('scores booking intent in the notes into the interested/warm band', () => {
    const r = computeColdStartBaseline({
      name: 'Rahul', email: 'r@x.com',
      notes: 'Wants to book a table for anniversary dinner this weekend, asked how much',
      source: 'referral',
    });
    // referral(12) + name(4) + email(6) + booking(20) + pricing(10) + occasion(8) + urgency(8) = 68
    expect(r.score).toBeGreaterThanOrEqual(55);
    expect(['warm', 'hot']).toContain(r.status);
    expect(r.signals).toEqual(expect.arrayContaining(['requested_booking', 'asked_pricing', 'occasion_mentioned']));
  });

  it('understands Hindi/Hinglish notes', () => {
    const r = computeColdStartBaseline({ notes: 'table chahiye kal ke liye, rate kya hai', source: 'whatsapp' });
    expect(r.signals).toEqual(expect.arrayContaining(['requested_booking', 'asked_pricing']));
    expect(r.score).toBeGreaterThan(15);
  });

  it('treats referral/walk-in as higher intent than a bulk list', () => {
    const list = computeColdStartBaseline({ source: 'csv_import', phone: '1' });
    const referral = computeColdStartBaseline({ source: 'referral', phone: '1' });
    const paid = computeColdStartBaseline({ source: 'meta_ads', phone: '1' });
    expect(referral.score).toBeGreaterThan(list.score);
    expect(paid.score).toBeGreaterThan(list.score);
    expect(referral.signals).toContain('source_referral');
    expect(paid.signals).toContain('source_paid_lead');
  });

  it('boosts returning customers with booking history', () => {
    const r = computeColdStartBaseline({
      name: 'Meera', source: 'walk_in', isRepeatCustomer: true, pastBookingsCount: 4,
    });
    expect(r.signals).toEqual(expect.arrayContaining(['returning_customer', 'repeated_visits']));
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it('never auto-qualifies from metadata alone (caps below 90 / at hot)', () => {
    const r = computeColdStartBaseline({
      name: 'Big Spender', email: 'b@x.com', birthday: '1980-01-01',
      source: 'referral', isRepeatCustomer: true, pastBookingsCount: 10,
      notes: 'urgent booking today, anniversary party, asked price and availability, very interested',
    });
    expect(r.score).toBeLessThan(90);
    expect(r.status).not.toBe('qualified');
    expect(r.status).not.toBe('converted');
    expect(r.status).toBe('hot');
  });

  it('short-circuits opt-out notes to lost/0', () => {
    const r = computeColdStartBaseline({ name: 'X', notes: 'Please do not contact me, unsubscribe', source: 'referral' });
    expect(r.score).toBe(0);
    expect(r.status).toBe('lost');
    expect(r.signals).toEqual(['opted_out']);
  });

  it('short-circuits spam notes to cold/0', () => {
    const r = computeColdStartBaseline({ notes: 'test entry, fake', source: 'referral' });
    expect(r.score).toBe(0);
    expect(r.status).toBe('cold');
  });

  it('penalises "not interested" notes and pins low-signal leads cold', () => {
    const r = computeColdStartBaseline({ notes: 'not interested, already booked elsewhere', source: 'csv_import' });
    expect(r.status).toBe('cold');
    expect(r.breakdown.some((e) => e.points < 0)).toBe(true);
  });

  it('band mapping is monotonic and covers every status', () => {
    expect(coldStartStatus(0)).toBe('cold');
    expect(coldStartStatus(14)).toBe('cold');
    expect(coldStartStatus(15)).toBe('new');
    expect(coldStartStatus(34)).toBe('new');
    expect(coldStartStatus(35)).toBe('interested');
    expect(coldStartStatus(54)).toBe('interested');
    expect(coldStartStatus(55)).toBe('warm');
    expect(coldStartStatus(69)).toBe('warm');
    expect(coldStartStatus(70)).toBe('hot');
    expect(coldStartStatus(100)).toBe('hot');
  });

  it('is a pure function — same input yields identical output', () => {
    const input = { name: 'A', email: 'a@b.com', notes: 'book table tomorrow', source: 'referral' };
    expect(computeColdStartBaseline(input)).toEqual(computeColdStartBaseline(input));
  });
});
