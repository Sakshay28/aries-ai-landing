// One-time / re-runnable loader: mirror devprayagjal.com's PUBLIC Shopify
// catalog into shopify_products/shopify_variants for the live WhatsApp
// tenant, and stamp shopify_store_url so the AI product-link path activates.
//
// This mirrors src/lib/shopify/publicCatalog.ts (which the deployed app uses
// via the daily public-catalog-sync cron). Run with:  node scripts/import-devprayagjal-catalog.mjs
//
// Usage: node scripts/import-devprayagjal-catalog.mjs [tenantId] [storefrontHost]

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

const TENANT_ID = process.argv[2] || '259c97b4-7920-4228-bcfe-217ff3a073a4';
const HOST = (process.argv[3] || 'devprayagjal.com').replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0];

// ── helpers (identical to src/lib/shopify/util.ts) ──────────
const htmlToText = (html) => !html ? '' : String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
const toNum = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'string' ? parseFloat(v) : Number(v); return Number.isFinite(n) ? n : null; };
const buildSearchText = (p) => {
  const tags = Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || '');
  return [p.title, p.vendor, p.product_type, tags, p.handle, p.body_text].filter(Boolean).join(' ').toLowerCase().slice(0, 4000);
};
const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

async function fetchAll() {
  const all = [];
  for (let page = 1; page <= 40; page++) {
    const res = await fetch(`https://${HOST}/products.json?limit=250&page=${page}`, { headers: { accept: 'application/json' } });
    if (!res.ok) { if (page === 1) throw new Error(`${HOST} /products.json -> ${res.status}`); break; }
    const j = await res.json();
    const products = j.products || [];
    all.push(...products);
    if (products.length < 250) break;
  }
  return all;
}

async function detectCurrency() {
  try { const r = await fetch(`https://${HOST}/meta.json`, { headers: { accept: 'application/json' } }); if (r.ok) { const j = await r.json(); if (j.currency) return j.currency; } } catch {}
  return null;
}

function productRow(p, currency) {
  const body_text = htmlToText(p.body_html);
  const variants = p.variants || [];
  const prices = variants.map(v => toNum(v.price)).filter(n => n != null);
  const anyAvailable = variants.some(v => v.available);
  const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(',').map(s => s.trim()).filter(Boolean) : []);
  return {
    tenant_id: TENANT_ID, shopify_id: p.id, handle: p.handle, title: p.title,
    body_html: p.body_html || null, body_text: body_text || null, vendor: p.vendor || null,
    product_type: p.product_type || null, tags, status: 'active',
    image_url: p.images?.[0]?.src || null, images: p.images || [],
    price_min: prices.length ? Math.min(...prices) : null, price_max: prices.length ? Math.max(...prices) : null,
    currency, total_inventory: variants.length === 0 ? null : (anyAvailable ? null : 0),
    online_store_url: null, shopify_created_at: p.created_at || null, shopify_updated_at: p.updated_at || null,
    published_at: p.published_at || null, synced_at: new Date().toISOString(),
    search_text: buildSearchText({ title: p.title, vendor: p.vendor, product_type: p.product_type, tags, body_text, handle: p.handle }),
    raw: null,
  };
}

function variantRows(productRowId, p, currency) {
  return (p.variants || []).map(v => ({
    tenant_id: TENANT_ID, product_id: productRowId, shopify_id: v.id, shopify_product_id: p.id,
    sku: v.sku || null, title: v.title || null, price: toNum(v.price), compare_at_price: toNum(v.compare_at_price),
    currency, inventory_item_id: null, inventory_quantity: null, inventory_policy: null,
    option1: v.option1 || null, option2: v.option2 || null, option3: v.option3 || null, image_url: null,
    requires_shipping: v.requires_shipping ?? null, weight: v.grams != null ? v.grams / 1000 : null,
    weight_unit: v.grams != null ? 'kg' : null, barcode: null,
    shopify_created_at: v.created_at || null, shopify_updated_at: v.updated_at || null, synced_at: new Date().toISOString(),
  }));
}

async function run() {
  console.log(`Importing ${HOST} → tenant ${TENANT_ID}`);
  const products = await fetchAll();
  const currency = await detectCurrency();
  console.log(`Fetched ${products.length} products (currency: ${currency || 'unknown'})`);

  let upserted = 0, errors = 0;
  const seen = [];
  for (const p of products) {
    try {
      const { data: row, error } = await sb.from('shopify_products')
        .upsert(productRow(p, currency), { onConflict: 'tenant_id,shopify_id' }).select('id').single();
      if (error) throw new Error(error.message);
      seen.push(p.id);
      const vr = variantRows(row.id, p, currency);
      for (const batch of chunk(vr, 100)) {
        const { error: verr } = await sb.from('shopify_variants').upsert(batch, { onConflict: 'tenant_id,shopify_id' });
        if (verr) throw new Error('variants: ' + verr.message);
      }
      upserted++;
    } catch (e) { errors++; console.error('  upsert failed', p.id, e.message); }
  }

  // Prune vanished products.
  let removed = 0;
  if (seen.length) {
    const { data: existing } = await sb.from('shopify_products').select('shopify_id').eq('tenant_id', TENANT_ID);
    const seenSet = new Set(seen);
    const stale = (existing || []).map(r => r.shopify_id).filter(id => !seenSet.has(id));
    for (const batch of chunk(stale, 100)) {
      const { count } = await sb.from('shopify_products').delete({ count: 'exact' }).eq('tenant_id', TENANT_ID).in('shopify_id', batch);
      removed += count ?? 0;
    }
  }

  const { error: tErr } = await sb.from('tenants').update({
    shopify_store_url: HOST,
    shopify_shop_meta: { currency, source: 'public_catalog', last_public_sync_at: new Date().toISOString() },
    shopify_sync_status: errors > 0 ? 'error' : 'idle',
    shopify_last_full_sync_at: new Date().toISOString(),
  }).eq('id', TENANT_ID);
  if (tErr) console.error('tenant update failed:', tErr.message);

  console.log(`Done. upserted=${upserted} removed=${removed} errors=${errors}`);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
