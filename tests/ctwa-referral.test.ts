import { describe, it, expect } from 'vitest';
import { isCtwaReferral } from '@/lib/meta/service';

// Regression cover for the click-to-WhatsApp attribution bug: the webhook and the
// flow engine each tested `source_type === 'ad'` independently, so a lead that came
// from the WhatsApp button on an organic Facebook/Instagram post was recorded as a
// plain WhatsApp message — no meta_ctwa source, no ctwa_clid kept for conversions,
// and any flow behind a "Meta Ad Click" trigger never fired.
describe('isCtwaReferral', () => {
  it('accepts a paid ad click', () => {
    expect(isCtwaReferral({ source_type: 'ad' })).toBe(true);
  });

  it('accepts a click from an organic post — the case that was being dropped', () => {
    expect(isCtwaReferral({ source_type: 'post' })).toBe(true);
  });

  it('is case-insensitive about the source type Meta sends', () => {
    expect(isCtwaReferral({ source_type: 'AD' })).toBe(true);
    expect(isCtwaReferral({ source_type: 'Post' })).toBe(true);
  });

  it('treats an unfamiliar source_type as CTWA rather than losing the lead', () => {
    // Meta only attaches `referral` to click-to-WhatsApp entries, so a newly
    // introduced source_type must not cost us the attribution.
    expect(isCtwaReferral({ source_type: 'some_future_placement' })).toBe(true);
    expect(isCtwaReferral({ ctwa_clid: 'ARBc...' })).toBe(true);
    expect(isCtwaReferral({ source_id: '120226305854810726' })).toBe(true);
  });

  it('reports no referral for an ordinary inbound message', () => {
    expect(isCtwaReferral(undefined)).toBe(false);
    expect(isCtwaReferral(null)).toBe(false);
  });

  it('ignores an empty referral object from a malformed payload', () => {
    expect(isCtwaReferral({})).toBe(false);
  });
});
