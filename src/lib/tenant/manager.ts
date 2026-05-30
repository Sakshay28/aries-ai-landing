// ═══════════════════════════════════════════════════════════
// 🏢 Tenant Manager — Multi-Tenancy Core
// ═══════════════════════════════════════════════════════════
// Handles tenant CRUD, lookup, caching, and config resolution.
// The webhook dispatcher uses getTenantByPhoneNumberId() to
// route incoming WhatsApp messages to the correct tenant.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Tenant } from '@/lib/types';
import { cacheGet, cacheSet, getRedisClient } from '@/lib/redis/client';

// ── Redis Cache (5 min TTL) ──
// Works across serverless invocations.
const CACHE_TTL_SECONDS = 300; // 5 minutes

async function getCached(key: string): Promise<Tenant | null> {
  const cachedStr = await cacheGet(`tenant_cache:${key}`);
  if (!cachedStr) return null;
  try {
    return JSON.parse(cachedStr) as Tenant;
  } catch {
    return null;
  }
}

async function setCache(key: string, tenant: Tenant) {
  await cacheSet(`tenant_cache:${key}`, JSON.stringify(tenant), CACHE_TTL_SECONDS);
}

export async function invalidateCache(tenantId: string) {
  // Try to get tenant to find all associated keys to invalidate
  const tenant = await getTenantById(tenantId);
  const redis = getRedisClient();
  if (!redis || !tenant) return;
  
  const keysToDelete = [`tenant_cache:id:${tenantId}`];
  if (tenant.wa_phone_number_id) keysToDelete.push(`tenant_cache:phone:${tenant.wa_phone_number_id}`);
  if (tenant.ig_page_id) keysToDelete.push(`tenant_cache:ig:${tenant.ig_page_id}`);
  if (tenant.shopify_store_url) keysToDelete.push(`tenant_cache:shopify:${tenant.shopify_store_url}`);
  
  try {
    await redis.del(...keysToDelete);
  } catch (err) {
    console.warn('⚠️ Failed to invalidate tenant cache:', err);
  }
}

// ── Stampede Protection ──
const inFlightPromises = new Map<string, Promise<Tenant | null>>();

// ═══════════════════════════════════════
// LOOKUP: By Tenant ID
// ═══════════════════════════════════════
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `id:${tenantId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  if (inFlightPromises.has(cacheKey)) return inFlightPromises.get(cacheKey)!;

  const promise = (async () => {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !data) return null;

    const tenant = data as Tenant;
    await setCache(cacheKey, tenant);
    if (tenant.wa_phone_number_id) await setCache(`phone:${tenant.wa_phone_number_id}`, tenant);
    if (tenant.ig_page_id) await setCache(`ig:${tenant.ig_page_id}`, tenant);
    return tenant;
  })();

  inFlightPromises.set(cacheKey, promise);
  try { return await promise; } finally { inFlightPromises.delete(cacheKey); }
}

// ═══════════════════════════════════════
// LOOKUP: By WhatsApp Phone Number ID
// ═══════════════════════════════════════
// This is the CRITICAL function used by the webhook dispatcher.
// When Meta sends a webhook, we extract phone_number_id from
// the payload and look up which tenant owns that number.
export async function getTenantByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
  const cacheKey = `phone:${phoneNumberId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const redis = getRedisClient();
  const lockKey = `lock:tenant:${phoneNumberId}`;
  if (redis) {
    const locked = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (!locked) {
      await new Promise(r => setTimeout(r, 200));
      return getCached(cacheKey).then(c => c ? (c as Tenant) : null);
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('wa_phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    const tenant = data as Tenant;
    // Await both cache sets BEFORE releasing lock (in finally)
    // to prevent stampede under concurrent webhook retries
    await Promise.all([
      setCache(cacheKey, tenant),
      setCache(`id:${tenant.id}`, tenant),
    ]);
    return tenant;
  } finally {
    if (redis) await redis.del(lockKey);
  }
}

// ═══════════════════════════════════════
// LOOKUP: By Instagram Page ID
// ═══════════════════════════════════════
export async function getTenantByIgPageId(igPageId: string): Promise<Tenant | null> {
  const cacheKey = `ig:${igPageId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  if (inFlightPromises.has(cacheKey)) return inFlightPromises.get(cacheKey)!;

  const promise = (async () => {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('ig_page_id', igPageId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    const tenant = data as Tenant;
    await setCache(cacheKey, tenant);
    await setCache(`id:${tenant.id}`, tenant);
    return tenant;
  })();

  inFlightPromises.set(cacheKey, promise);
  try { return await promise; } finally { inFlightPromises.delete(cacheKey); }
}

// ═══════════════════════════════════════
// LOOKUP: By Shopify Store URL
// ═══════════════════════════════════════
export async function getTenantByShopifyUrl(storeUrl: string): Promise<Tenant | null> {
  const cached = await getCached(`shopify:${storeUrl}`);
  if (cached) return cached;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('shopify_store_url', storeUrl)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  const tenant = data as Tenant;
  await setCache(`shopify:${storeUrl}`, tenant);
  return tenant;
}

// ═══════════════════════════════════════
// CREATE: New Tenant
// ═══════════════════════════════════════
export async function createTenant(input: {
  business_name: string;
  business_type?: string;
  business_email?: string;
  business_phone?: string;
  bot_name?: string;
  plan?: Tenant['plan'];
}): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert({
      business_name: input.business_name,
      business_type: input.business_type || 'Restaurant',
      business_email: input.business_email,
      business_phone: input.business_phone,
      bot_name: input.bot_name || 'Assistant',
      plan: input.plan || 'starter',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create tenant: ${error.message}`);
  return data as Tenant;
}

// ═══════════════════════════════════════
// UPDATE: Tenant Config
// ═══════════════════════════════════════
export async function updateTenant(
  tenantId: string,
  updates: Partial<Tenant>
): Promise<Tenant> {
  // Remove fields that shouldn't be directly updated (id, created_at are immutable)
  const immutable = new Set(['id', 'created_at']);
  const safeUpdates = Object.fromEntries(
    Object.entries(updates as Record<string, unknown>).filter(([k]) => !immutable.has(k))
  );

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(safeUpdates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update tenant: ${error.message}`);

  const tenant = data as Tenant;
  invalidateCache(tenantId);
  return tenant;
}

// ═══════════════════════════════════════
// LIST: All Tenants (Admin only)
// ═══════════════════════════════════════
export async function listTenants(options?: {
  limit?: number;
  offset?: number;
  plan?: string;
  status?: string;
}): Promise<{ tenants: Tenant[]; total: number }> {
  let query = supabaseAdmin
    .from('tenants')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.plan) query = query.eq('plan', options.plan);
  if (options?.status) query = query.eq('plan_status', options.status);
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to list tenants: ${error.message}`);
  return { tenants: (data || []) as Tenant[], total: count || 0 };
}

// ═══════════════════════════════════════
// CONNECT: WhatsApp Credentials
// ═══════════════════════════════════════
export async function connectWhatsApp(
  tenantId: string,
  credentials: {
    wa_phone_number_id: string;
    wa_access_token: string;
    wa_business_account_id?: string;
    wa_app_secret?: string;
  }
): Promise<Tenant> {
  return updateTenant(tenantId, {
    ...credentials,
    wa_webhook_verified: false,
    onboarding_completed: true,
  } as Partial<Tenant>);
}

// ═══════════════════════════════════════
// USAGE: Increment Message Counter
// ═══════════════════════════════════════
export async function incrementMessageCount(tenantId: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const key = `usage:msg:${tenantId}:${currentMonth}`;
    const count = await redis.incr(key);
    await redis.expire(key, 86400 * 32);

    if (count % 10 === 0) {
      supabaseAdmin.rpc('set_message_count', { t_id: tenantId, count }).then(({ error }) => { if (error) console.error(error); });
    }
  } else {
    await supabaseAdmin.rpc('increment_message_count', { t_id: tenantId });
  }
}

// ═══════════════════════════════════════
// CHECK: Is tenant within usage limits?
// ═══════════════════════════════════════
export async function checkUsageLimits(tenant: Tenant): Promise<{
  withinLimits: boolean;
  messagesRemaining: number;
  usagePercent: number;
}> {
  let currentUsage = tenant.messages_used_this_month;
  const currentConvos = tenant.ai_conversations_this_month ?? 0;
  const conversationLimit = tenant.ai_conversation_limit ?? 100;

  const redis = getRedisClient();
  if (redis) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const key = `usage:msg:${tenant.id}:${currentMonth}`;
    const cachedCount = await redis.get(key);
    if (cachedCount) {
      currentUsage = parseInt(cachedCount, 10);
    } else {
      const { data } = await supabaseAdmin.from('tenants').select('messages_used_this_month').eq('id', tenant.id).single();
      if (data) {
        currentUsage = data.messages_used_this_month;
        await redis.set(key, currentUsage.toString(), 'EX', 86400 * 32);
      }
    }
  }

  const messagesRemaining = tenant.message_limit - currentUsage;
  const convosRemaining = conversationLimit - currentConvos;
  
  const usagePercent = Math.round((currentUsage / tenant.message_limit) * 100);

  return {
    withinLimits: messagesRemaining > 0 && convosRemaining > 0,
    messagesRemaining: Math.max(0, messagesRemaining),
    usagePercent: Math.min(100, usagePercent),
  };
}

// ═══════════════════════════════════════
// TENANT CONFIG: For Conversation Engine
// ═══════════════════════════════════════
// Returns a clean config object for the AI conversation engine.
export function getTenantConfig(tenant: Tenant) {
  return {
    businessName: tenant.business_name,
    businessType: tenant.business_type,
    botName: tenant.bot_name,
    botPersonality: tenant.bot_personality,
    phone: tenant.business_phone || '',
    address: tenant.business_address || '',
    website: tenant.business_website || '',
    welcomeMessage: tenant.welcome_message || '',
    welcomeOffer: tenant.welcome_offer || '',
    usps: tenant.usps || [],
    staffName: tenant.staff_name || 'our team',
    workingHours: tenant.working_hours,
    hotKeywords: tenant.hot_keywords,
    warmKeywords: tenant.warm_keywords,
    // Fix #7: Custom FAQs flow to AI engine
    customFaqs: tenant.custom_faqs || [],
    // Fix #8: Off-hours config
    offHoursMessage: tenant.off_hours_message,
    offHoursCaptureLead: tenant.off_hours_capture_lead ?? true,
    // Unified Staff Guidelines
    systemPrompt: tenant.system_prompt || '',
  };
}
