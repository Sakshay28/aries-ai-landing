// ═══════════════════════════════════════════════════════════
// 🧪 AI Engine — Offline Fallback & Provider Status Tests
// ═══════════════════════════════════════════════════════════
// Validates:
// 1. offlineKBSearch correctly matches FAQs and Knowledge Docs
// 2. Provider status tracking (success/failure recording)
// 3. Fallback response uses business name from config
// 4. No stale/hardcoded business references survive
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getProviderStatus } from '@/lib/ai/engine';
import type { TenantAIConfig } from '@/lib/ai/engine';
import fs from 'fs';
import path from 'path';

// Import the testing export
const engineModule = await import('@/lib/ai/engine');
const offlineKBSearch = (engineModule as Record<string, unknown>)._offlineKBSearch_forTesting as (
  message: string,
  config: TenantAIConfig
) => string | null;

// ── Test Fixtures ──
function makeConfig(overrides: Partial<TenantAIConfig> = {}): TenantAIConfig {
  return {
    businessName: 'Aries AI',
    businessType: 'SaaS',
    botName: 'Aria',
    botPersonality: 'support_hero',
    phone: '+91-9876543210',
    address: 'Mumbai, India',
    website: 'https://ariesai.in',
    welcomeMessage: 'Welcome to Aries AI!',
    welcomeOffer: '',
    usps: ['WhatsApp AI', 'Multi-language support'],
    staffName: 'Team Aries',
    isFirstMessage: false,
    customFaqs: [],
    knowledgeDocs: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════
// TEST SUITE 1: Offline KB Search
// ═══════════════════════════════════════
describe('offlineKBSearch', () => {
  it('returns null when no FAQs or KB docs exist', () => {
    const config = makeConfig();
    expect(offlineKBSearch('How can Aries AI help?', config)).toBeNull();
  });

  it('matches a FAQ when question keywords overlap', () => {
    const config = makeConfig({
      customFaqs: [
        { question: 'What languages does Aries AI support?', answer: 'We support English, Hindi, and Hinglish.' },
        { question: 'How much does it cost?', answer: 'Plans start at ₹2,999/month.' },
      ],
    });

    const result = offlineKBSearch('Do you support Hindi and Hinglish?', config);
    expect(result).toBe('We support English, Hindi, and Hinglish.');
  });

  it('matches pricing FAQ for cost questions', () => {
    const config = makeConfig({
      customFaqs: [
        { question: 'What is the pricing?', answer: 'Plans start at ₹2,999/month with a free trial.' },
      ],
    });

    const result = offlineKBSearch('How much does Aries AI cost?', config);
    // Should match because "pricing" keywords appear
    expect(result).toContain('₹2,999');
  });

  it('matches knowledge docs when FAQs have no match', () => {
    const config = makeConfig({
      customFaqs: [
        { question: 'What is your name?', answer: 'I am Aria.' },
      ],
      knowledgeDocs: [
        {
          filename: 'aries-ai-features.txt',
          content_text: 'Aries AI connects to WhatsApp Business API and provides automated customer support.\n\nMeta Click-to-WhatsApp Ads integration allows businesses to capture leads directly from Facebook and Instagram ads into WhatsApp conversations.\n\nOur platform supports Hindi, Hinglish, and English languages for natural conversation.',
        },
      ],
    });

    const result = offlineKBSearch('Can I connect Meta Click-to-WhatsApp Ads?', config);
    expect(result).toBeTruthy();
    expect(result).toContain('Meta');
  });

  it('returns null for completely unrelated queries', () => {
    const config = makeConfig({
      customFaqs: [
        { question: 'What languages do you support?', answer: 'English, Hindi, Hinglish.' },
      ],
      knowledgeDocs: [
        { filename: 'features.txt', content_text: 'WhatsApp AI assistant with multilingual support.' },
      ],
    });

    const result = offlineKBSearch('What is the weather today?', config);
    expect(result).toBeNull();
  });

  it('does NOT return Clock Tower Restaurant content for an Aries AI tenant', () => {
    const config = makeConfig({
      businessName: 'Aries AI',
      businessType: 'SaaS',
      customFaqs: [
        { question: 'What services does Aries AI provide?', answer: 'AI-powered WhatsApp automation for businesses.' },
      ],
    });

    const result = offlineKBSearch('What services do you offer?', config);
    if (result) {
      expect(result).not.toContain('Clock Tower');
      expect(result).not.toContain('restaurant');
      expect(result).not.toContain('valet');
      expect(result).not.toContain('chef');
      expect(result).not.toContain('reservation');
    }
  });
});

// ═══════════════════════════════════════
// TEST SUITE 2: Provider Status
// ═══════════════════════════════════════
describe('getProviderStatus', () => {
  it('returns a status object with required fields', () => {
    const status = getProviderStatus();
    expect(status).toHaveProperty('available');
    expect(status).toHaveProperty('consecutiveFailures');
    expect(typeof status.available).toBe('boolean');
    expect(typeof status.consecutiveFailures).toBe('number');
  });

  it('returns a copy (not a reference to the internal state)', () => {
    const status1 = getProviderStatus();
    const status2 = getProviderStatus();
    expect(status1).not.toBe(status2); // Different object references
    expect(status1).toEqual(status2);  // Same values
  });
});

// ═══════════════════════════════════════
// TEST SUITE 3: No Stale Business Context
// ═══════════════════════════════════════
describe('No hardcoded business references in engine', () => {
  const enginePath = path.resolve(__dirname, '../src/lib/ai/engine.ts');

  it('engine source does not contain "Clock Tower"', () => {
    const source = fs.readFileSync(enginePath, 'utf-8');
    expect(source).not.toContain('Clock Tower');
  });

  it('engine source does not hardcode restaurant-specific intents in fallback', () => {
    const source = fs.readFileSync(enginePath, 'utf-8');
    const fallbackSection = source.slice(source.indexOf('function getFallbackResponse'));
    expect(fallbackSection).not.toContain('Clock Tower');
    expect(fallbackSection).not.toContain('valet parking');
    expect(fallbackSection).not.toContain('chef special');
  });

  it('guardrails source does not contain "Clock Tower"', () => {
    const guardrailsPath = path.resolve(__dirname, '../src/lib/ai/guardrails.ts');
    const source = fs.readFileSync(guardrailsPath, 'utf-8');
    expect(source).not.toContain('Clock Tower');
  });

  it('playground route does not contain "Clock Tower"', () => {
    const routePath = path.resolve(__dirname, '../src/app/api/dashboard/playground/route.ts');
    const source = fs.readFileSync(routePath, 'utf-8');
    expect(source).not.toContain('Clock Tower');
  });
});

// ═══════════════════════════════════════
// TEST SUITE 4: Business Switching Simulation
// ═══════════════════════════════════════
describe('Business switching — no context leakage', () => {
  it('fallback for Restaurant config uses restaurant name', () => {
    const restaurantConfig = makeConfig({
      businessName: 'Clock Tower Restaurant',
      businessType: 'Restaurant',
      customFaqs: [
        { question: 'Do you have valet parking?', answer: 'Yes, complimentary valet parking is available.' },
      ],
    });

    const result = offlineKBSearch('Do you have valet parking?', restaurantConfig);
    expect(result).toContain('valet');
  });

  it('fallback for SaaS config does NOT leak restaurant data', () => {
    const saasConfig = makeConfig({
      businessName: 'Aries AI',
      businessType: 'SaaS',
      customFaqs: [
        { question: 'What does Aries AI do?', answer: 'AI-powered WhatsApp automation.' },
      ],
    });

    const result = offlineKBSearch('Do you have valet parking?', saasConfig);
    expect(result).toBeNull();
  });

  it('switching from Restaurant to SaaS config clears restaurant context', () => {
    // Step 1: Restaurant config
    const restaurantConfig = makeConfig({
      businessName: 'Clock Tower Restaurant',
      businessType: 'Restaurant',
      customFaqs: [
        { question: 'What are your specials?', answer: 'Chef special: Truffle risotto.' },
      ],
    });
    const restaurantResult = offlineKBSearch('What are your specials?', restaurantConfig);
    expect(restaurantResult).toContain('risotto');

    // Step 2: SaaS config — completely different tenant
    const saasConfig = makeConfig({
      businessName: 'Aries AI',
      businessType: 'SaaS',
      customFaqs: [
        { question: 'What features does Aries AI have?', answer: 'WhatsApp AI, CRM integration, analytics.' },
      ],
    });
    const saasResult = offlineKBSearch('What are your specials?', saasConfig);
    // MUST NOT leak restaurant data
    expect(saasResult).toBeNull();

    // Also verify SaaS responds correctly to its own queries
    const saasFeatureResult = offlineKBSearch('What features do you have?', saasConfig);
    expect(saasFeatureResult).toContain('WhatsApp');
  });
});
