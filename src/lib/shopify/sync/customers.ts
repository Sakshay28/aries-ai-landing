// Customers sync + lead linkage.
//
// On upsert, we opportunistically match to an existing Aries lead by
// (tenant_id, normalized phone) or (tenant_id, lowercased email) and
// stamp shopify_customer_id on the lead. We do NOT auto-create a lead
// from a customer — the lead is created when the user talks to us on
// WhatsApp/IG/etc. Linking is what matters for AI context ("Sakshay
// last ordered X").

import { ShopifyClient } from '../client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toNum } from '../util';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';

interface ShopifyCustomer {
  id: number;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  orders_count?: number;
  total_spent?: string | number | null;
  currency?: string | null;
  tags?: string | null;
  accepts_marketing?: boolean;
  state?: string | null;
  created_at?: string;
  updated_at?: string;
}

async function findLeadForCustomer(tenantId: string, phone: string | null, email: string | null): Promise<string | null> {
  if (phone) {
    const { data } = await supabaseAdmin.from('leads').select('id')
      .eq('tenant_id', tenantId).eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  if (email) {
    const { data } = await supabaseAdmin.from('leads').select('id')
      .eq('tenant_id', tenantId).ilike('email', email).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

export async function upsertCustomer(tenantId: string, c: ShopifyCustomer): Promise<void> {
  const normPhone = c.phone ? normalizePhoneNumber(c.phone) : null;
  const email = c.email ? c.email.toLowerCase() : null;
  const leadId = await findLeadForCustomer(tenantId, normPhone, email);

  const row = {
    tenant_id: tenantId,
    shopify_id: c.id,
    lead_id: leadId,
    email,
    phone: normPhone,
    first_name: c.first_name || null,
    last_name: c.last_name || null,
    orders_count: c.orders_count ?? 0,
    total_spent: toNum(c.total_spent) ?? 0,
    currency: c.currency || null,
    tags: c.tags ? c.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    accepts_marketing: !!c.accepts_marketing,
    state: c.state || null,
    shopify_created_at: c.created_at || null,
    shopify_updated_at: c.updated_at || null,
    synced_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from('shopify_customers')
    .upsert(row, { onConflict: 'tenant_id,shopify_id' });
  if (error) throw new Error(`upsert customer ${c.id}: ${error.message}`);

  // Back-link the lead → Shopify customer id
  if (leadId) {
    await supabaseAdmin.from('leads').update({ shopify_customer_id: String(c.id) })
      .eq('id', leadId).is('shopify_customer_id', null);
  }
}

export async function deleteCustomer(tenantId: string, shopifyId: number): Promise<void> {
  const { error } = await supabaseAdmin.from('shopify_customers').delete()
    .eq('tenant_id', tenantId).eq('shopify_id', shopifyId);
  if (error) throw new Error(`delete customer ${shopifyId}: ${error.message}`);
}

export async function syncCustomersPage(
  client: ShopifyClient,
  tenantId: string,
  pageInfo: string | null
): Promise<{ processed: number; upserted: number; errors: number; nextCursor: string | null }> {
  const res = await client.rest<{ customers: ShopifyCustomer[] }>('GET', 'customers.json', {
    query: pageInfo ? { limit: 250 } : { limit: 250 },
    pageInfo: pageInfo ?? undefined,
  });
  const customers = res.body.customers || [];
  let upserted = 0;
  let errors = 0;
  for (const c of customers) {
    try { await upsertCustomer(tenantId, c); upserted++; }
    catch (e) { errors++; console.error('[shopify:sync:customers]', (e as Error).message); }
  }
  return { processed: customers.length, upserted, errors, nextCursor: res.nextPageInfo };
}
