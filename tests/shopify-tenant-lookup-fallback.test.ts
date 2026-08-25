import { describe, it, expect } from 'vitest';

// Documents the behavior of the myshopify-domain fallback in
// getTenantByShopifyUrl(). The full function goes through supabase; here we
// verify the SHAPE of the JSONB path selector we rely on (Supabase's
// `->>'key'` operator inside .eq()) is spelled correctly, since a typo would
// silently return null for every custom-domain tenant — exactly the class of
// silent 200 that dropped Devprayagjal webhooks for 14 days.
//
// Ideally this would exercise the DB path via an integration test, but the
// suite doesn't have a Supabase test harness. This guard at least makes the
// key/spelling change loud in code review.

import fs from 'node:fs';

describe('getTenantByShopifyUrl fallback', () => {
  const source = fs.readFileSync('src/lib/tenant/manager.ts', 'utf8');

  it('queries shopify_shop_meta->>myshopify_domain as the fallback path', () => {
    expect(source).toMatch(/shopify_shop_meta->>myshopify_domain/);
  });

  it('keeps the primary lookup on shopify_store_url', () => {
    expect(source).toMatch(/\.eq\(\s*['"]shopify_store_url['"]/);
  });

  it('gates both lookups on is_active=true so soft-disabled tenants stay off', () => {
    const isActive = source.match(/\.eq\(\s*['"]is_active['"],\s*true\s*\)/g) || [];
    expect(isActive.length).toBeGreaterThanOrEqual(2);
  });
});
