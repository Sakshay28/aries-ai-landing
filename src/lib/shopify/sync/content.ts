// Content sync: pages, blogs, articles, policies, discounts.
// Small enough that a single pass per resource is fine — not paginated.

import { ShopifyClient } from '../client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { htmlToText, toNum } from '../util';

interface Page { id: number; handle: string; title: string; body_html?: string | null; author?: string | null; published_at?: string | null; updated_at?: string | null; }
interface Blog { id: number; handle: string; title: string; commentable?: string; }
interface Article { id: number; blog_id: number; handle: string; title: string; body_html?: string | null; summary_html?: string | null; author?: string | null; tags?: string; image?: { src?: string }; published_at?: string | null; updated_at?: string | null; }
interface Policy { title?: string; body?: string; url?: string; }
interface PriceRule { id: number; title?: string; value_type?: string; value?: string; usage_limit?: number | null; starts_at?: string | null; ends_at?: string | null; target_type?: string; target_selection?: string; }
interface DiscountCode { id: number; code: string; usage_count?: number; created_at?: string; }

// ─── Pages ──────────────────────────────────────────────────
export async function syncAllPages(client: ShopifyClient, tenantId: string): Promise<{ upserted: number }> {
  let upserted = 0;
  for await (const page of client.paginate<Page>('pages.json', {}, 'pages')) {
    for (const p of page) {
      const { error } = await supabaseAdmin.from('shopify_pages').upsert({
        tenant_id: tenantId,
        shopify_id: p.id,
        handle: p.handle,
        title: p.title,
        body_html: p.body_html || null,
        body_text: htmlToText(p.body_html),
        author: p.author || null,
        published_at: p.published_at || null,
        shopify_updated_at: p.updated_at || null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,shopify_id' });
      if (!error) upserted++;
      else console.error('[shopify:sync:pages]', error.message);
    }
  }
  return { upserted };
}

// ─── Blogs + articles ───────────────────────────────────────
export async function syncAllBlogsAndArticles(client: ShopifyClient, tenantId: string): Promise<{ blogs: number; articles: number }> {
  let blogs = 0;
  let articles = 0;
  for await (const page of client.paginate<Blog>('blogs.json', {}, 'blogs')) {
    for (const b of page) {
      const { data: blogRow, error } = await supabaseAdmin.from('shopify_blogs').upsert({
        tenant_id: tenantId,
        shopify_id: b.id,
        handle: b.handle,
        title: b.title,
        commentable: b.commentable || null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,shopify_id' }).select('id').single();
      if (error || !blogRow) { console.error('[shopify:sync:blogs]', error?.message); continue; }
      blogs++;

      for await (const artPage of client.paginate<Article>(`blogs/${b.id}/articles.json`, {}, 'articles')) {
        for (const a of artPage) {
          const { error: aerr } = await supabaseAdmin.from('shopify_articles').upsert({
            tenant_id: tenantId,
            blog_id: blogRow.id,
            shopify_id: a.id,
            shopify_blog_id: a.blog_id,
            handle: a.handle,
            title: a.title,
            body_html: a.body_html || null,
            body_text: htmlToText(a.body_html),
            summary: htmlToText(a.summary_html) || null,
            author: a.author || null,
            tags: a.tags ? a.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
            image_url: a.image?.src || null,
            published_at: a.published_at || null,
            shopify_updated_at: a.updated_at || null,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,shopify_id' });
          if (!aerr) articles++;
          else console.error('[shopify:sync:articles]', aerr.message);
        }
      }
    }
  }
  return { blogs, articles };
}

// ─── Policies ───────────────────────────────────────────────
// Policies come with `shop.json`? No — separate endpoint /policies.json (public shop policies)
// Returns array of { title, body, url, created_at, updated_at }. `handle` disambiguates type.
export async function syncPolicies(client: ShopifyClient, tenantId: string): Promise<{ upserted: number }> {
  const res = await client.rest<{ policies: Array<Policy & { handle?: string }> }>('GET', 'policies.json');
  let upserted = 0;
  for (const p of res.body.policies || []) {
    const policyType = (p.handle || (p.title || '').toLowerCase().replace(/\s+/g, '_') || 'other').slice(0, 40);
    const { error } = await supabaseAdmin.from('shopify_policies').upsert({
      tenant_id: tenantId,
      policy_type: policyType,
      title: p.title || null,
      body: htmlToText(p.body) || p.body || null,
      url: p.url || null,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,policy_type' });
    if (!error) upserted++;
    else console.error('[shopify:sync:policies]', error.message);
  }
  return { upserted };
}

// ─── Discounts ──────────────────────────────────────────────
// Price rules own the discount definition; each has 0..N discount codes.
export async function syncAllDiscounts(client: ShopifyClient, tenantId: string): Promise<{ upserted: number }> {
  let upserted = 0;
  for await (const rulePage of client.paginate<PriceRule>('price_rules.json', {}, 'price_rules')) {
    for (const rule of rulePage) {
      // pull codes for this rule
      const codesRes = await client.rest<{ discount_codes: DiscountCode[] }>('GET', `price_rules/${rule.id}/discount_codes.json`);
      const now = Date.now();
      const status = rule.starts_at && new Date(rule.starts_at).getTime() > now ? 'scheduled'
        : rule.ends_at && new Date(rule.ends_at).getTime() < now ? 'expired' : 'active';
      for (const code of codesRes.body.discount_codes || []) {
        const { error } = await supabaseAdmin.from('shopify_discounts').upsert({
          tenant_id: tenantId,
          shopify_id: code.id,
          shopify_price_rule_id: rule.id,
          code: code.code,
          discount_type: rule.value_type || null,
          value: toNum(rule.value),
          value_type: rule.value_type || null,
          starts_at: rule.starts_at || null,
          ends_at: rule.ends_at || null,
          usage_limit: rule.usage_limit ?? null,
          times_used: code.usage_count ?? 0,
          status,
          applies_to: { target_type: rule.target_type, target_selection: rule.target_selection },
          synced_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,shopify_id' });
        if (!error) upserted++;
        else console.error('[shopify:sync:discounts]', error.message);
      }
    }
  }
  return { upserted };
}
