import { describe, it, expect } from 'vitest';
import { trimCredentialFields, PLAINTEXT_WA_CREDENTIAL_FIELDS } from '../src/lib/utils/credentials';

describe('trimCredentialFields', () => {
  it('trims a leading space from wa_business_account_id (the real bug)', () => {
    const updates: Record<string, unknown> = { wa_business_account_id: ' 839339342310354' };
    trimCredentialFields(updates);
    expect(updates.wa_business_account_id).toBe('839339342310354');
  });

  it('trims leading and trailing whitespace across all plaintext credential fields', () => {
    const updates: Record<string, unknown> = {
      wa_phone_number_id: '  1178978078636436 ',
      wa_business_account_id: '\t839339342310354\n',
      wa_verify_token: ' e89c00df ',
    };
    trimCredentialFields(updates);
    expect(updates.wa_phone_number_id).toBe('1178978078636436');
    expect(updates.wa_business_account_id).toBe('839339342310354');
    expect(updates.wa_verify_token).toBe('e89c00df');
  });

  it('leaves clean values and unrelated / non-string fields untouched', () => {
    const updates: Record<string, unknown> = {
      wa_business_account_id: '839339342310354',
      business_name: '  Neo - Lounge  ', // not a credential field — must be preserved as-is
      wa_phone_number_id: undefined,
    };
    trimCredentialFields(updates);
    expect(updates.wa_business_account_id).toBe('839339342310354');
    expect(updates.business_name).toBe('  Neo - Lounge  ');
    expect(updates.wa_phone_number_id).toBeUndefined();
  });

  it('only targets the three plaintext credential fields (encrypted fields excluded)', () => {
    expect([...PLAINTEXT_WA_CREDENTIAL_FIELDS]).toEqual([
      'wa_phone_number_id',
      'wa_business_account_id',
      'wa_verify_token',
    ]);
  });
});
