// Read-only audit: for every product stored for the devprayagjal tenant,
// verify the product URL we'd hand to the AI (https://store/products/handle)
// actually resolves (HTTP 200) on the live storefront. Flags anything dead.
// Usage: node scripts/audit-devprayagjal-links.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = {};
fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(l => {
  const c = l.trim();
  if (!c || c.startsWith('#')) return;
  const p = c.split('=');
  if (p.length >= 2) env[p[0].trim()] = p.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const TENANT_ID = '259c97b4-7920-4228-bcfe-217ff3a073a4';

async function run() {
  const { data: tenant } = await sb.from('tenants').select('shopify_store_url').eq('id', TENANT_ID).single();
  const host = tenant.shopify_store_url;
  console.log('store host:', host);

  const { data: products, error } = await sb.from('shopify_products')
    .select('handle, title, status')
    .eq('tenant_id', TENANT_ID);
  if (error) throw error;
  console.log('products in DB:', products.length);

  let ok = 0, bad = 0;
  const badList = [];
  const batchSize = 10;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    await Promise.all(batch.map(async (p) => {
      const url = `https://${host}/products/${p.handle}`;
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        if (res.ok) { ok++; } else { bad++; badList.push({ handle: p.handle, title: p.title, status: res.status }); }
      } catch (e) {
        bad++; badList.push({ handle: p.handle, title: p.title, status: 'fetch_error: ' + e.message });
      }
    }));
  }
  console.log(`OK=${ok} BAD=${bad}`);
  if (badList.length) {
    console.log('BAD LINKS:');
    for (const b of badList) console.log(' -', b.status, b.handle, '|', b.title);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
