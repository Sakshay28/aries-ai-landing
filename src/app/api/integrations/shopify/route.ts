// Shopify integration admin API.
//
//   GET    /api/integrations/shopify         → status summary for the caller's tenant
//   POST   /api/integrations/shopify         → { action: 'connect' | 'sync' | 'validate' | 'register_webhooks' }
//   DELETE /api/integrations/shopify         → disconnect

import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import {
  connectTenant, disconnectTenant, getStatus, triggerFullSync, validateCredentials, registerWebhooks, reprovisionTemplates, updateOrderConfirmationSettings,
} from '@/lib/shopify/service';
import { ShopifyClient, DEFAULT_API_VERSION } from '@/lib/shopify/client';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = await getStatus(tenantId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'validate') {
    if (!body.store_url || !body.access_token) {
      return NextResponse.json({ error: 'store_url and access_token required' }, { status: 400 });
    }
    const res = await validateCredentials({
      storeUrl: body.store_url,
      accessToken: body.access_token,
      apiVersion: body.api_version,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === 'connect') {
    if (!body.store_url || !body.access_token || !body.shared_secret) {
      return NextResponse.json({ error: 'store_url, access_token, shared_secret required' }, { status: 400 });
    }
    const res = await connectTenant({
      tenantId,
      storeUrl: body.store_url,
      accessToken: body.access_token,
      sharedSecret: body.shared_secret,
      apiVersion: body.api_version,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === 'sync') {
    const result = await triggerFullSync(tenantId, { lookbackDays: body.lookback_days });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'provision_templates') {
    const result = await reprovisionTemplates(tenantId);
    return NextResponse.json({ ok: true, result });
  }

  if (action === 'update_order_confirmation_settings') {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
    }
    const result = await updateOrderConfirmationSettings(tenantId, { enabled: body.enabled });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === 'register_webhooks') {
    const { data: tenant } = await supabaseAdmin.from('tenants')
      .select('shopify_store_url, shopify_access_token, shopify_api_version')
      .eq('id', tenantId).single();
    if (!tenant?.shopify_access_token || !tenant?.shopify_store_url) {
      return NextResponse.json({ error: 'not connected' }, { status: 400 });
    }
    const token = decryptTokenV2(tenant.shopify_access_token);
    if (!token) return NextResponse.json({ error: 'decrypt failed' }, { status: 500 });
    const client = new ShopifyClient({
      storeUrl: tenant.shopify_store_url,
      accessToken: token,
      apiVersion: tenant.shopify_api_version || DEFAULT_API_VERSION,
    });
    const result = await registerWebhooks(tenantId, client);
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function DELETE() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await disconnectTenant(tenantId);
  return NextResponse.json({ ok: true });
}
