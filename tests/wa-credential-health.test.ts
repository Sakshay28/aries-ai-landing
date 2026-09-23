// Regression tests for the Globesome outage (2026-08-29 → 2026-09-23).
//
// Globesome India's WhatsApp number lived in the shared "Aries AI" WABA, but
// the stored token came from a different Meta app whose system user had no
// WhatsApp assets. Every send returned code 100 / subcode 33. Inbound was
// unaffected, so nothing in the product ever said the tenant was offline.
//
// The two properties that had to hold, and now do:
//   1. a credential-class failure is recognised as a TENANT-WIDE outage, and
//   2. an ordinary per-message failure is NOT — no false "you are offline".

import { describe, it, expect } from 'vitest';
import { classifyCredentialFault, describeSendFailure } from '@/lib/whatsapp/credentialHealth';

// Verbatim from messages.error_message on the two failed Globesome replies.
const GLOBESOME_ENVELOPE =
  'Meta Cloud API text error 400: {"error":{"message":"Unsupported post request. Object with ID ' +
  "'1307923625733053' does not exist, cannot be loaded due to missing permissions, or does not " +
  'support this operation. Please read the Graph API documentation at ' +
  'https://developers.facebook.com/docs/graph-api","type":"GraphMethodException","code":100,' +
  '"error_subcode":33,"fbtrace_id":"AYEHa9hmve4yySYNg-m3LIZ"}} [fbtrace_id=AYEHa9hmve4yySYNg-m3LIZ]';

describe('classifyCredentialFault — the outage that started this', () => {
  it('recognises the exact stored Globesome error as a credential outage', () => {
    const fault = classifyCredentialFault(GLOBESOME_ENVELOPE);
    expect(fault).not.toBeNull();
    expect(fault!.kind).toBe('no_asset_access');
    expect(fault!.code).toBe(100);
    expect(fault!.subcode).toBe(33);
  });

  it('reads code and subcode off a structured error without parsing text', () => {
    const fault = classifyCredentialFault({ code: 100, subcode: 33, message: 'anything' });
    expect(fault?.kind).toBe('no_asset_access');
  });

  it('tells the operator what to actually go and do', () => {
    const fault = classifyCredentialFault(GLOBESOME_ENVELOPE);
    expect(fault!.action).toMatch(/system user/i);
    expect(fault!.title).not.toMatch(/Unsupported post request/);
  });
});

describe('classifyCredentialFault — credential faults', () => {
  it.each([
    [190, 'token_invalid'],
    [102, 'token_invalid'],
    [200, 'no_asset_access'],
    [10, 'no_asset_access'],
    [133010, 'number_not_registered'],
    [131042, 'billing'],
    [131031, 'account_restricted'],
  ])('code %i is a %s outage', (code, kind) => {
    expect(classifyCredentialFault({ code })?.kind).toBe(kind);
  });

  it('treats a missing/undecryptable token as fatal, not as a per-message blip', () => {
    expect(classifyCredentialFault('missing/undecryptable wa_access_token')?.kind).toBe('token_invalid');
  });

  it('treats an unconfigured phone number ID as fatal', () => {
    expect(classifyCredentialFault('missing wa_phone_number_id')?.kind).toBe('no_asset_access');
  });
});

describe('classifyCredentialFault — must NOT cry outage', () => {
  it('ignores a closed 24h window (131047) — that is one message, not the channel', () => {
    expect(classifyCredentialFault({ code: 131047 })).toBeNull();
  });

  it.each([131026, 131051, 132000, 132001, 132015, 132016, 130429, 131048])(
    'ignores per-message / throttle code %i',
    (code) => {
      expect(classifyCredentialFault({ code })).toBeNull();
    },
  );

  it('does NOT treat a bare code 100 as an outage — only the 100/33 pair', () => {
    // Plain 100 is Meta's generic "invalid parameter" and fires on ordinary bad
    // payloads. Promoting it would put a red "WhatsApp is offline" banner in
    // front of a tenant whose channel is perfectly fine.
    expect(classifyCredentialFault({ code: 100 })).toBeNull();
    expect(classifyCredentialFault({ code: 100, subcode: 99 })).toBeNull();
  });

  it('ignores errors with no recoverable code at all', () => {
    expect(classifyCredentialFault('socket hang up')).toBeNull();
    expect(classifyCredentialFault(null)).toBeNull();
    expect(classifyCredentialFault(undefined)).toBeNull();
    expect(classifyCredentialFault(new Error('fetch failed'))).toBeNull();
  });
});

describe('describeSendFailure — the inbox must never show a bare red "!"', () => {
  it('always returns a sentence, even with nothing stored', () => {
    expect(describeSendFailure(null)).toMatch(/didn’t accept/i);
    expect(describeSendFailure('')).toMatch(/didn’t accept/i);
  });

  it('explains the Globesome failure in plain words, not JSON', () => {
    const text = describeSendFailure(GLOBESOME_ENVELOPE);
    expect(text).not.toMatch(/\{|"error"|fbtrace/);
    expect(text).toMatch(/cannot reach the configured WhatsApp number/i);
  });

  it('keeps the 24h-window wording actionable', () => {
    expect(describeSendFailure('SESSION_EXPIRED')).toMatch(/template/i);
  });

  it('unwraps Meta’s own message and drops the doc-link boilerplate', () => {
    const raw = 'Meta Cloud API text error 400: {"error":{"message":"Recipient phone number not in allowed list. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api","code":131030}}';
    const text = describeSendFailure(raw);
    expect(text).toContain('Recipient phone number not in allowed list');
    expect(text).not.toMatch(/Graph API documentation/);
  });
});
