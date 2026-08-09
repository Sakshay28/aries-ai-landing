import { describe, it, expect } from 'vitest';
import { verifyShiprocketApiKey } from '@/lib/shiprocket/webhookVerify';

describe('verifyShiprocketApiKey', () => {
  it('accepts a matching key', () => {
    expect(verifyShiprocketApiKey('secret-123', 'secret-123')).toBe(true);
  });

  it('rejects a wrong key', () => {
    expect(verifyShiprocketApiKey('wrong-key', 'secret-123')).toBe(false);
  });

  it('rejects a missing provided key', () => {
    expect(verifyShiprocketApiKey(null, 'secret-123')).toBe(false);
    expect(verifyShiprocketApiKey(undefined, 'secret-123')).toBe(false);
  });

  it('rejects a missing expected key', () => {
    expect(verifyShiprocketApiKey('secret-123', null)).toBe(false);
  });

  it('rejects keys of different lengths without throwing', () => {
    expect(verifyShiprocketApiKey('short', 'a-much-longer-secret')).toBe(false);
  });
});
