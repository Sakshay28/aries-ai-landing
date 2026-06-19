import { describe, it, expect } from 'vitest';
import {
  kwWordMatch,
  scriptedKeywordMatch,
  pickScriptedReply,
  isScriptedReplyRelevant,
  allowStatusUpdate,
} from '@/lib/webhook/decisions';
import { isHumanHandoffRequest } from '@/lib/ai/engine';

// ─── Scripted reply keyword matching ─────────────────────────────────────────
// Encodes two real production bugs as permanent regressions:
//   1. substring firing: "hi" matched inside "hindi"        (fix 138436d)
//   2. Hinglish particle: "hi" fired on "tum hi batao"      (fix e48ddeb)

describe('scriptedKeywordMatch', () => {
  it('short keyword fires when it IS the message', () => {
    expect(scriptedKeywordMatch('hi', 'hi')).toBe(true);
    expect(scriptedKeywordMatch('hey', 'hey')).toBe(true);
  });

  it('short keyword fires at the start of the message', () => {
    expect(scriptedKeywordMatch('hi there', 'hi')).toBe(true);
    expect(scriptedKeywordMatch('hi, can i book a table?', 'hi')).toBe(true);
    expect(scriptedKeywordMatch('hey! menu please', 'hey')).toBe(true);
  });

  it('REGRESSION: short keyword does NOT fire mid-sentence (Hinglish particle)', () => {
    expect(scriptedKeywordMatch('tum hi batao', 'hi')).toBe(false);
    expect(scriptedKeywordMatch('tum toh bologae hi aacha hain', 'hi')).toBe(false);
    expect(scriptedKeywordMatch('aap hey kya', 'hey')).toBe(false);
  });

  it('REGRESSION: keyword does NOT fire as substring of a longer word', () => {
    expect(scriptedKeywordMatch('hindi me baat karo', 'hi')).toBe(false);
    expect(scriptedKeywordMatch('yahi chahiye', 'hi')).toBe(false);
    expect(scriptedKeywordMatch('the menucard is missing', 'menu card')).toBe(false);
  });

  it('long keyword fires anywhere with word boundaries', () => {
    expect(scriptedKeywordMatch('can you send the menu card please', 'menu card')).toBe(true);
    expect(scriptedKeywordMatch('PRICING details?', 'pricing')).toBe(true);
  });

  it('handles regex special characters in keywords safely', () => {
    expect(scriptedKeywordMatch('what is the price (veg)?', 'price (veg)')).toBe(true);
    expect(scriptedKeywordMatch('c++ course', 'c++')).toBe(true);
  });

  it('empty/whitespace keywords never fire', () => {
    expect(scriptedKeywordMatch('hello', '')).toBe(false);
    expect(scriptedKeywordMatch('hello', '   ')).toBe(false);
  });
});

describe('pickScriptedReply', () => {
  const rows = [
    { keywords: ['hi', 'hello'], reply: 'GREETING' },
    { keywords: ['menu'], reply: 'MENU' },
    { keywords: ['menu card'], reply: 'MENU_CARD' },
  ];

  it('longest matching keyword wins (specific beats broad)', () => {
    expect(pickScriptedReply(rows, 'send me the menu card')?.reply).toBe('MENU_CARD');
  });

  it('falls back to shorter keyword when only it matches', () => {
    expect(pickScriptedReply(rows, 'menu please')?.reply).toBe('MENU');
  });

  it('returns undefined when nothing matches', () => {
    expect(pickScriptedReply(rows, 'kya haal hai bhai')).toBeUndefined();
  });

  it('tolerates malformed rows without keywords arrays', () => {
    const malformed = [{ keywords: null as unknown as string[], reply: 'X' }, ...rows];
    expect(pickScriptedReply(malformed, 'hello ji')?.reply).toBe('GREETING');
  });

  it('skips scripted reply when keyword is in a complaint context', () => {
    expect(pickScriptedReply(rows, 'I have a problem with your menu items being stale')).toBeUndefined();
    expect(pickScriptedReply(rows, 'the menu was terrible and the food was cold')).toBeUndefined();
  });

  it('skips scripted reply when keyword is in an action/change request', () => {
    expect(pickScriptedReply(rows, 'can you change the menu for my booking please')).toBeUndefined();
    expect(pickScriptedReply(rows, 'I want to cancel my menu order that was placed')).toBeUndefined();
  });

  it('still fires for simple requests containing the keyword', () => {
    expect(pickScriptedReply(rows, 'menu please')?.reply).toBe('MENU');
    expect(pickScriptedReply(rows, 'menu dikhao')?.reply).toBe('MENU');
    // "show me the menu" — "menu" is ≤4 chars so only fires at message start
    expect(pickScriptedReply(rows, 'show me the menu')).toBeUndefined();
  });
});

// ─── Scripted reply relevance check ─────────────────────────────────────────

describe('isScriptedReplyRelevant', () => {
  it('short messages are always relevant', () => {
    expect(isScriptedReplyRelevant('menu', 'menu')).toBe(true);
    expect(isScriptedReplyRelevant('send menu', 'menu')).toBe(true);
    expect(isScriptedReplyRelevant('menu dikhao', 'menu')).toBe(true);
    expect(isScriptedReplyRelevant('menu please send', 'menu')).toBe(true);
    expect(isScriptedReplyRelevant('menu card bhejo', 'menu card')).toBe(true);
  });

  it('rejects complaint/negative context', () => {
    expect(isScriptedReplyRelevant('the menu was terrible and the food was cold', 'menu')).toBe(false);
    expect(isScriptedReplyRelevant('I am disappointed with the menu quality here', 'menu')).toBe(false);
    expect(isScriptedReplyRelevant('menu mein kuch galat hai', 'menu')).toBe(false);
    expect(isScriptedReplyRelevant('timing bahut kharab thi aaj ki', 'timing')).toBe(false);
  });

  it('rejects action/modification requests', () => {
    expect(isScriptedReplyRelevant('can you change the menu for my event', 'menu')).toBe(false);
    expect(isScriptedReplyRelevant('I want to cancel my reservation at your location', 'location')).toBe(false);
    expect(isScriptedReplyRelevant('please update the menu with new prices for us', 'menu')).toBe(false);
  });

  it('rejects very long messages where keyword is incidental', () => {
    expect(isScriptedReplyRelevant(
      'I was at your restaurant yesterday and the waiter showed me the menu but I left early because of the crowd',
      'menu'
    )).toBe(false);
  });

  it('allows medium-length simple requests', () => {
    expect(isScriptedReplyRelevant('can you send me the menu', 'menu')).toBe(true);
    expect(isScriptedReplyRelevant('what are your timings today', 'timings')).toBe(true);
    expect(isScriptedReplyRelevant('share your location please', 'location')).toBe(true);
  });
});

// ─── Escalation / routing keyword matching ───────────────────────────────────

describe('kwWordMatch', () => {
  it('matches whole words anywhere in the message', () => {
    expect(kwWordMatch('i want a refund now', 'refund')).toBe(true);
    expect(kwWordMatch('REFUND!!', 'refund')).toBe(true);
  });

  it('does not match substrings of longer words', () => {
    expect(kwWordMatch('the item was refunded', 'refund')).toBe(false);
    expect(kwWordMatch('humanity is good', 'human')).toBe(false);
  });

  it('handles multi-word keywords', () => {
    expect(kwWordMatch('please talk to manager about this', 'talk to manager')).toBe(true);
  });
});

// ─── Human handoff backstop ──────────────────────────────────────────────────

describe('isHumanHandoffRequest', () => {
  it('detects explicit human requests (English)', () => {
    expect(isHumanHandoffRequest('Connect me to a human')).toBe(true);
    expect(isHumanHandoffRequest('can I talk to a representative?')).toBe(true);
    expect(isHumanHandoffRequest('Please connect with your team')).toBe(true);
    expect(isHumanHandoffRequest('connect me with the team please')).toBe(true);
    expect(isHumanHandoffRequest('can i speak to someone?')).toBe(true);
  });

  it('detects Hinglish human requests', () => {
    expect(isHumanHandoffRequest('kisi insaan se baat karao')).toBe(true);
  });

  it('detects demo booking requests', () => {
    expect(isHumanHandoffRequest('I want to book a demo')).toBe(true);
  });

  it('does not fire on normal conversation', () => {
    expect(isHumanHandoffRequest('how are you')).toBe(false);
    expect(isHumanHandoffRequest('Main badhiya hoon! Aap batao')).toBe(false);
    expect(isHumanHandoffRequest('what is the price')).toBe(false);
  });

  it('does not fire on substring lookalikes', () => {
    expect(isHumanHandoffRequest('humanity is a great value')).toBe(false);
  });

  it('handles empty/undefined input', () => {
    expect(isHumanHandoffRequest(undefined)).toBe(false);
    expect(isHumanHandoffRequest('')).toBe(false);
  });
});

// ─── Status callback monotonic ordering ──────────────────────────────────────
// Meta delivers status callbacks out of order; ticks must never downgrade.

describe('allowStatusUpdate', () => {
  it('read is terminal — nothing overwrites it', () => {
    expect(allowStatusUpdate('read', 'delivered')).toBe(false);
    expect(allowStatusUpdate('read', 'sent')).toBe(false);
    expect(allowStatusUpdate('read', 'failed')).toBe(false);
  });

  it('delivered only upgrades to read', () => {
    expect(allowStatusUpdate('delivered', 'read')).toBe(true);
    expect(allowStatusUpdate('delivered', 'sent')).toBe(false);
    expect(allowStatusUpdate('delivered', 'failed')).toBe(false);
  });

  it('failed can be revived by a later delivery/read callback', () => {
    expect(allowStatusUpdate('failed', 'delivered')).toBe(true);
    expect(allowStatusUpdate('failed', 'read')).toBe(true);
    expect(allowStatusUpdate('failed', 'sent')).toBe(false);
  });

  it('sent/pending accept any forward progress', () => {
    expect(allowStatusUpdate('sent', 'delivered')).toBe(true);
    expect(allowStatusUpdate('sent', 'read')).toBe(true);
    expect(allowStatusUpdate('pending', 'sent')).toBe(true);
  });
});
