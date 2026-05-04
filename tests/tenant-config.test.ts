import { describe, it, expect } from 'vitest';
import { getTenantConfig } from '../src/lib/tenant/manager';
import type { Tenant } from '../src/lib/types';

// Minimal tenant fixture — only fields getTenantConfig touches need to be real.
function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-123',
    business_name: 'Spice Garden',
    business_type: 'restaurant',
    business_email: 'owner@spicegarden.in',
    business_phone: '+919999999999',
    business_address: '123 MG Road',
    business_website: 'https://spicegarden.in',
    bot_name: 'Spicy',
    bot_personality: 'friendly',
    welcome_offer: '10% off your first booking',
    usps: ['Authentic North Indian', 'Family-owned'],
    staff_name: 'Rahul',
    working_hours: { open: '11:00', close: '23:00' },
    hot_keywords: ['book', 'reserve'],
    warm_keywords: ['menu', 'price'],
    custom_faqs: [{ question: 'Parking?', answer: 'Yes, free.' }],
    off_hours_message: 'We are closed.',
    messages_used_this_month: 0,
    message_limit: 1000,
    ai_conversations_this_month: 0,
    ai_conversation_limit: 100,
    ...overrides,
  } as unknown as Tenant;
}

describe('tenant: getTenantConfig (config projection)', () => {
  it('projects only AI-relevant fields, never leaking secrets', () => {
    // Inject secret-shaped fields via cast to verify they don't leak through
    // the config projection. The `as unknown as Tenant` cast in makeTenant
    // accepts arbitrary keys.
    const tenant = makeTenant({
      wa_access_token: 'enc:v1:SHOULD_NOT_LEAK',
      razorpay_subscription_id: 'sub_secret',
    } as unknown as Partial<Tenant>);

    const cfg = getTenantConfig(tenant);

    // Must NOT contain any token or billing fields
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain('SHOULD_NOT_LEAK');
    expect(serialized).not.toContain('sub_secret');
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('razorpay');
  });

  it('two tenants produce independent configs (no shared state)', () => {
    const a = makeTenant({ id: 't-A', business_name: 'A Co', usps: ['unique-A'] });
    const b = makeTenant({ id: 't-B', business_name: 'B Co', usps: ['unique-B'] });

    const cfgA = getTenantConfig(a);
    const cfgB = getTenantConfig(b);

    expect(cfgA.businessName).toBe('A Co');
    expect(cfgB.businessName).toBe('B Co');
    expect(cfgA.usps).toEqual(['unique-A']);
    expect(cfgB.usps).toEqual(['unique-B']);

    // Mutating one config must not bleed into the other.
    cfgA.usps.push('mutated');
    expect(cfgB.usps).toEqual(['unique-B']);
  });

  it('falls back gracefully when optional fields are missing', () => {
    const tenant = makeTenant({
      business_phone: undefined as unknown as string,
      business_address: undefined as unknown as string,
      business_website: undefined as unknown as string,
      welcome_offer: undefined as unknown as string,
      usps: undefined as unknown as string[],
      staff_name: undefined as unknown as string,
      custom_faqs: undefined as unknown as { question: string; answer: string }[],
    });

    const cfg = getTenantConfig(tenant);
    expect(cfg.phone).toBe('');
    expect(cfg.address).toBe('');
    expect(cfg.website).toBe('');
    expect(cfg.welcomeOffer).toBe('');
    expect(cfg.usps).toEqual([]);
    expect(cfg.staffName).toBe('our team');
    expect(cfg.customFaqs).toEqual([]);
  });
});
