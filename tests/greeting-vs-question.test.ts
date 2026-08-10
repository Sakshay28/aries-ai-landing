// ═══════════════════════════════════════════════════════════
// 🧪 AI Engine — Greeting vs. Real Question Detection
// ═══════════════════════════════════════════════════════════
// Regression tests for the "AI always replies with welcome message
// instead of answering the actual question" bug. A message is a
// greeting only when it carries NOTHING beyond the pleasantry
// ("hi", "hi there", "hi Mezo"). A message that opens with a greeting
// word but goes on to ask/request something ("hi, do you have the
// 7 mukhi rudraksh?", "Hi Mezo I would like to book a table...")
// must be treated as a real question, not a bare greeting.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import type { TenantAIConfig } from '@/lib/ai/engine';

const engineModule = await import('@/lib/ai/engine');
const isBareGreeting = (engineModule as Record<string, unknown>)._isBareGreeting_forTesting as (
  text: string,
  businessName?: string
) => boolean;
const getFallbackResponse = (engineModule as Record<string, unknown>)._getFallbackResponse_forTesting as (
  message: string,
  context: unknown,
  config: TenantAIConfig,
  isFirstMessage?: boolean
) => { reply: string; intent: string };

function makeConfig(overrides: Partial<TenantAIConfig> = {}): TenantAIConfig {
  return {
    businessName: 'Devprayagjal',
    businessType: 'E-commerce',
    botName: 'Aria',
    botPersonality: 'support_hero',
    phone: '+91-9876543210',
    address: 'Devprayag, India',
    website: 'https://devprayagjal.com',
    welcomeMessage: 'Hey! 👋 Welcome to Devprayagjal! How can I help you today?',
    welcomeOffer: '',
    usps: [],
    staffName: 'Team',
    isFirstMessage: false,
    customFaqs: [],
    knowledgeDocs: [],
    ...overrides,
  };
}

describe('isBareGreeting', () => {
  it('treats plain greetings as bare greetings', () => {
    expect(isBareGreeting('hi')).toBe(true);
    expect(isBareGreeting('Hello')).toBe(true);
    expect(isBareGreeting('hey!')).toBe(true);
    expect(isBareGreeting('namaste 🙏')).toBe(true);
    expect(isBareGreeting('hi there')).toBe(true);
    expect(isBareGreeting('Good morning')).toBe(true);
  });

  it('treats a greeting plus the business name as a bare greeting', () => {
    expect(isBareGreeting('Hi Mezo', 'Mezo Jaipur')).toBe(true);
    expect(isBareGreeting('hello Devprayagjal', 'Devprayagjal')).toBe(true);
  });

  it('does NOT treat a greeting followed by a real question as bare', () => {
    // Exact repro from the reported bug
    expect(isBareGreeting('7 mukhi nepali rudarak link')).toBe(false);
    expect(
      isBareGreeting('Hi Mezo I would like to book a table and claim the flat 15 percent off offer.', 'Mezo Jaipur')
    ).toBe(false);
    expect(isBareGreeting('hi, do you have the 7 mukhi rudraksh in stock?')).toBe(false);
    expect(isBareGreeting('hello, what are your opening hours?')).toBe(false);
  });

  it('does not misclassify unrelated content as a greeting', () => {
    expect(isBareGreeting('how much does shipping cost')).toBe(false);
    expect(isBareGreeting('')).toBe(true); // empty message treated as bare (nothing to answer)
  });
});

describe('getFallbackResponse — greeting vs. question on first contact', () => {
  it('sends the configured welcome for a bare first-message greeting', () => {
    const config = makeConfig({ isFirstMessage: true });
    const result = getFallbackResponse('hi', {}, config, true);
    expect(result.reply).toContain('Welcome to Devprayagjal');
    expect(result.intent).toBe('greeting');
  });

  it('does NOT send the welcome message for a real first-message question', () => {
    const config = makeConfig({ isFirstMessage: true });
    const result = getFallbackResponse('7 mukhi nepali rudarak link', {}, config, true);
    expect(result.reply).not.toContain('Welcome to Devprayagjal');
  });

  it('does NOT send a generic greeting for "Hi <business>, book a table" style requests', () => {
    const mezoConfig = makeConfig({ businessName: 'Mezo Jaipur', isFirstMessage: true, welcomeMessage: undefined });
    const result = getFallbackResponse(
      'Hi Mezo I would like to book a table and claim the flat 15 percent off offer.',
      {},
      mezoConfig,
      true
    );
    // Must be routed as a booking intent, not a bare greeting reply
    expect(result.intent).toBe('reserve_table');
    expect(result.reply.toLowerCase()).not.toContain('welcome');
  });
});
