import { describe, it, expect } from 'vitest';
import {
  kwWordMatch,
  scriptedKeywordMatch,
  pickScriptedReply,
  isScriptedReplyRelevant,
  allowStatusUpdate,
  hasActiveFlow,
  resolveWebhookFailure,
} from '@/lib/webhook/decisions';
import { isHumanHandoffRequest } from '@/lib/ai/engine';
import { SESSION_EXPIRED } from '@/lib/media/outbound-media';
import type { ChatMediaMeta } from '@/lib/types';

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

  it('rejects follow-up questions asking ABOUT the keyword', () => {
    // Customer asks "which hotel?" — canned reply dumps generic info, AI should answer specifically
    expect(isScriptedReplyRelevant('Which hotel?', 'hotel')).toBe(false);
    expect(isScriptedReplyRelevant('What kind of meals??', 'meals')).toBe(false);
    expect(isScriptedReplyRelevant('What is the name of the hotel?', 'hotel')).toBe(false);
    expect(isScriptedReplyRelevant('Where is the hotel located?', 'hotel')).toBe(false);
    expect(isScriptedReplyRelevant('How much does the rafting cost?', 'rafting')).toBe(false);
    expect(isScriptedReplyRelevant('When does the expedition start?', 'expedition')).toBe(false);
    // Hindi question words
    expect(isScriptedReplyRelevant('kaunsa hotel hai?', 'hotel')).toBe(false);
    expect(isScriptedReplyRelevant('kya meals milenge?', 'meals')).toBe(false);
    expect(isScriptedReplyRelevant('kahan pe hotel hai?', 'hotel')).toBe(false);
  });

  it('still fires when keyword is at message start (request, not question)', () => {
    // "menu" at start → requesting the menu, not asking about it
    expect(isScriptedReplyRelevant('menu', 'menu')).toBe(true);
    expect(isScriptedReplyRelevant('hotel details', 'hotel')).toBe(true);
    expect(isScriptedReplyRelevant('rafting info', 'rafting')).toBe(true);
    expect(isScriptedReplyRelevant('meals included?', 'meals')).toBe(true);
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

  it('allows medium-length simple requests (no question word before keyword)', () => {
    expect(isScriptedReplyRelevant('can you send me the menu', 'menu')).toBe(true);
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

// ─── hasActiveFlow — Flow > Human > AI priority gate ─────────────────────────
// Regression for the P0 bug: a button reply's label text (e.g. "Book a table")
// could match a tenant's scripted-reply keyword and hijack an in-progress flow
// before the flow engine ever got to resume it. Scripted replies must be
// skipped for the entire duration a flow owns the conversation.

describe('hasActiveFlow', () => {
  it('is true while pending_flow_node is set', () => {
    expect(hasActiveFlow({ pending_flow_node: 'date_selection' })).toBe(true);
  });

  it('is false once pending_flow_node has been cleared', () => {
    expect(hasActiveFlow({ pending_flow_node: null })).toBe(false);
    expect(hasActiveFlow({})).toBe(false);
  });

  it('is false for a conversation with no context at all', () => {
    expect(hasActiveFlow(undefined)).toBe(false);
    expect(hasActiveFlow(null)).toBe(false);
  });

  it('REGRESSION: a scripted-reply-worthy keyword inside an active flow must still be treated as flow-owned', () => {
    // e.g. the "23 Jul - 29 Jul" button's label text happens to contain "jul" —
    // if some tenant configured a scripted reply on that keyword, it must not
    // fire while the date-selection flow node is waiting for this exact reply.
    const context = { pending_flow_node: 'date_selection', last_message: '23 Jul - 29 Jul' };
    expect(hasActiveFlow(context)).toBe(true);
  });
});

// ─── resolveWebhookFailure — async media-send failure reporting ─────────────
// REGRESSION (2026-09-21): an inbox photo was accepted by Meta synchronously
// (our 'sent' write cached a provider_media_id), then Meta's status webhook
// reported it failed asynchronously. The webhook handler wrote Meta's raw
// error title ("Media upload error") straight into error_message and never
// touched metadata.media — so the cached provider_media_id survived. Retry
// kept resending that exact (Meta-rejected) media ID and kept failing the
// exact same way: prod messages 9bee977e.../b5c54117... sat on status=
// 'failed' with metadata.media.stage still 'sent' after 3 retries.

describe('resolveWebhookFailure', () => {
  const sentMediaMeta: ChatMediaMeta = {
    bucket: 'chat-attachments',
    storage_path: 't/c/obj.png',
    send_as: 'image',
    attempts: 1,
    stage: 'sent',
    attempt_started_at: '2026-09-21T03:50:04.895Z',
    delivery_mode: 'media_id',
    provider_media_id: '1451199000206974',
    provider_media_id_at: '2026-09-21T03:50:11.344Z',
    last_error: null,
  };
  const now = new Date('2026-09-21T04:00:00.000Z');

  it('REGRESSION: clears the cached provider_media_id on an async media failure, so Retry re-uploads', () => {
    const result = resolveWebhookFailure({ errorCode: 131052, mediaMeta: sentMediaMeta, now });
    expect(result.mediaMeta?.provider_media_id).toBeNull();
    expect(result.mediaMeta?.provider_media_id_at).toBeNull();
    expect(result.mediaMeta?.stage).toBe('failed');
    expect(result.mediaMeta?.last_error).toEqual({ code: '131052', stage: 'webhook', at: now.toISOString() });
  });

  it('REGRESSION: never surfaces Meta’s raw error title ("Media upload error") to the operator', () => {
    const result = resolveWebhookFailure({
      errorCode: 131052,
      errorReason: 'Media upload error', // Meta's own raw title — must not pass through untranslated
      mediaMeta: sentMediaMeta,
      now,
    });
    expect(result.errorMessage).not.toBe('Media upload error');
    expect(result.errorMessage).toBe('WhatsApp couldn’t process this file. Use a JPG/PNG photo or an MP4 (H.264) video.');
  });

  it('preserves the rest of the media metadata (storage_path, bucket) untouched', () => {
    const result = resolveWebhookFailure({ errorCode: 131052, mediaMeta: sentMediaMeta, now });
    expect(result.mediaMeta?.storage_path).toBe(sentMediaMeta.storage_path);
    expect(result.mediaMeta?.bucket).toBe(sentMediaMeta.bucket);
  });

  it('maps a 24h-window closure to SESSION_EXPIRED even for a media message', () => {
    const result = resolveWebhookFailure({ errorCode: 131047, mediaMeta: sentMediaMeta, now });
    expect(result.errorMessage).toBe(SESSION_EXPIRED);
    // Still clears the stale ID — retry should re-upload fresh either way.
    expect(result.mediaMeta?.provider_media_id).toBeNull();
  });

  it('records a failure_reason breadcrumb for media messages, matching the sync-path "stage:code" convention', () => {
    const result = resolveWebhookFailure({ errorCode: 131052, mediaMeta: sentMediaMeta, now });
    expect(result.failureReason).toBe('webhook:131052');
  });

  it('leaves plain text/template messages (no metadata.media) on the original raw-Meta-text behavior', () => {
    const withReason = resolveWebhookFailure({ errorCode: 131026, errorReason: 'Recipient opted out', now });
    expect(withReason.errorMessage).toBe('Recipient opted out');
    expect(withReason.mediaMeta).toBeUndefined();
    expect(withReason.failureReason).toBeUndefined();

    const withoutReason = resolveWebhookFailure({ errorCode: 131026, now });
    expect(withoutReason.errorMessage).toBe('Meta error 131026');

    const withNeither = resolveWebhookFailure({ now });
    expect(withNeither.errorMessage).toBe('Delivery failed');
  });

  it('maps SESSION_EXPIRED for a plain text message too (unchanged prior behavior)', () => {
    const result = resolveWebhookFailure({ errorCode: 131047, now });
    expect(result.errorMessage).toBe(SESSION_EXPIRED);
    expect(result.mediaMeta).toBeUndefined();
  });
});
