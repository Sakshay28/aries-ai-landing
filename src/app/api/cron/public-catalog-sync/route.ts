// Cron: refresh token-less public Shopify catalogs.
//
// Clients connected via the PUBLIC storefront feed (see
// src/lib/shopify/publicCatalog.ts) have no Admin API token and are NOT
// served by the webhook-driven shopify-sync queue. This daily job re-pulls
// their /products.json so new products, price changes and sold-out flags
// stay current for the WhatsApp AI. Idempotent and safe to re-run.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { importPublicCatalog } from '@/lib/shopify/publicCatalog';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Public-catalog tenants: a storefront URL is set but there's no Admin
  // token, and the connection was created by the public importer.
  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, shopify_store_url, shopify_shop_meta')
    .not('shopify_store_url', 'is', null)
    .is('shopify_access_token', null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (tenants || []).filter(
    t => (t.shopify_shop_meta as { source?: string } | null)?.source === 'public_catalog',
  );

  const results: Array<{ tenant_id: string; ok: boolean; upserted?: number; removed?: number; error?: string }> = [];
  for (const t of targets) {
    try {
      const r = await importPublicCatalog(t.id, t.shopify_store_url as string);
      results.push({ tenant_id: t.id, ok: r.errors === 0, upserted: r.upserted, removed: r.removed });
    } catch (e) {
      results.push({ tenant_id: t.id, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, tenants: targets.length, results });
}

export const GET = handler;
export const POST = handler;
