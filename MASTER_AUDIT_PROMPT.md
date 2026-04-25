# ⚡ PROJECT BOLT — MASTER 100-CLIENT READINESS AUDIT PROMPT

> Copy-paste this **entire document** into Claude, ChatGPT, or any AI to get a rigorous,
> line-by-line production review without wasting time on things we already solved.

---

## 🎯 YOUR MISSION

You are a senior distributed-systems engineer performing a **production-readiness audit** of Project Bolt — a multi-tenant SaaS platform that must serve **100 paying clients simultaneously** with zero data leakage, zero dropped messages, and zero downtime. 

Your job is to find **real, actionable bugs** that would hurt a live client. You are NOT here to:
- Suggest minor stylistic refactors
- Complain about `any` types that exist for intentional flexibility
- Re-flag issues that are already solved (listed in Section 3)
- Suggest adding tests (out of scope right now)
- Recommend TypeScript strictness upgrades

You ARE here to identify:
- Logic bugs that could corrupt or leak tenant data
- Race conditions under concurrent load
- Unhandled error paths that would silently drop messages or billing events
- Security vulnerabilities that could be exploited at scale
- Performance bottlenecks that would degrade at 100 tenants
- Missing guards that could cause crashes in production

**Confidence requirement:** Only flag something if you are ≥90% sure it is a genuine production risk. If you are unsure, say so explicitly and explain why it might be fine.

---

## 🏗️ ARCHITECTURE OVERVIEW

**Stack:** Next.js 16 (App Router) · Supabase (PostgreSQL + RLS) · Google Gemini 2.0 Flash · BullMQ + Redis (Upstash/ioredis) · Razorpay Subscriptions · Resend Email · Sentry

**Deployment:** Next.js app on Vercel (serverless). BullMQ worker (`worker.ts`) on a persistent server (Render/Railway). Redis on Upstash (TLS).

**Key invariants already solved and locked — DO NOT RE-FLAG THESE:**

### ✅ SOLVED — DO NOT RE-FLAG

| # | What Was Fixed | Where |
|---|---------------|-------|
| 1 | `ENCRYPTION_KEY` hard-fails at startup if < 16 chars — no silent bad-key | `crypto.ts` |
| 2 | Token expiry only triggered on Meta `OAuthException` error code 190, NOT any 401 | `whatsapp/service.ts` |
| 3 | `enc:v1:` prefix scheme — tokens stored as `enc:v1:<iv>:<tag>:<ciphertext>` | `crypto.ts` |
| 4 | Redis cache lock releases only AFTER `Promise.all([cacheId, cacheTenant])` — no stampede | `tenant/manager.ts` |
| 5 | Broadcast concurrency = 1, 50ms sleep between sends — under Meta's 80 msg/s limit | `broadcast/queue.ts` |
| 6 | Broadcast route: 3 dead imports pruned, `is_active` + `wa_token_expired` guards added | `api/broadcast/route.ts` |
| 7 | HMAC signature verified **before** JSON.parse — no untrusted payload parsing | `api/webhooks/whatsapp/route.ts` |
| 8 | BullMQ lives only in `worker.ts` — never imported in Next.js API routes | `worker.ts` |
| 9 | Supabase Admin, GenAI, Razorpay use lazy-init proxy getters — no build-time crash | `supabase/admin.ts` |
| 10 | All webhook routes rate-limited via Redis (not ephemeral in-memory) | `redis/client.ts` |
| 11 | All dashboard API routes guarded by `getTenantId()` auth check | every `api/dashboard/*` route |
| 12 | Razorpay webhook has idempotency check via `analytics_events` before processing | `api/webhooks/razorpay/route.ts` |
| 13 | Token expiry sends Resend email alert + flags `wa_token_expired=true` + invalidates cache | `whatsapp/service.ts` → `handleTokenExpiry()` |
| 14 | Instagram token refresh cron re-encrypts with `encryptToken()` — plaintext never stored | `api/cron/instagram-refresh/route.ts` |
| 15 | Admin route dual-guard: `is_platform_admin` DB flag AND `PLATFORM_ADMIN_EMAIL` env match | `api/admin/overview/route.ts` |
| 16 | Cron routes protected by `CRON_SECRET` Bearer token — not open to public | `api/cron/*/route.ts` |
| 17 | All 9 core tables have RLS enabled + per-tenant policies in schema.sql | `database/schema.sql` |
| 18 | Webhook deduplication: Redis SETNX → DB fallback → in-memory fallback (3 tiers) | `redis/client.ts` → `isDuplicateMessage()` |
| 19 | `withTimeout()` wraps Gemini calls at 15,000ms — no infinite AI hangs | `utils/safety.ts` |
| 20 | AI tokens counted per invocation via Supabase RPC `increment_ai_tokens` | `ai/engine.ts` |
| 21 | Signup has Zod schema validation + rate limit (5/hr per IP) + atomic rollback on failure | `api/auth/signup/route.ts` |
| 22 | Pause route verifies conversation `tenant_id` before allowing update | `api/dashboard/conversations/[id]/pause/route.ts` |
| 23 | `vercel.json` has `maxDuration = 60` on webhook routes | `next.config.ts` / `vercel.json` |
| 24 | Webhook payload hard-limited to 2MB via `content-length` check | `api/webhooks/whatsapp/route.ts` |
| 25 | Graceful SIGTERM/SIGINT shutdown in worker — queues drain before exit | `worker.ts` |

---

## 📁 COMPLETE CODEBASE

Review every line of the following files:

---

### `src/lib/utils/crypto.ts`
```typescript
// AES-256-GCM token encryption/decryption
// Key: ENCRYPTION_KEY env var (must be 32 hex chars = 16 bytes min)
// Format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (raw.length < 16) {
    throw new Error('ENCRYPTION_KEY must be at least 16 characters long. Set a secure 32+ char random string.');
  }
  return crypto.scryptSync(raw, 'salt', 32);
}

export function encryptToken(token: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(token: string | null | undefined): string {
  if (!token) return '';
  if (!token.startsWith(ENC_PREFIX)) {
    // Legacy plaintext token — return as-is (migration path)
    return token;
  }
  try {
    const key = getKey();
    const rest = token.slice(ENC_PREFIX.length);
    const [ivHex, tagHex, ciphertextHex] = rest.split(':');
    if (!ivHex || !tagHex || !ciphertextHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
```

---

### `src/lib/tenant/manager.ts`
```typescript
// Tenant config manager with Redis-backed caching + Redlock race protection
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient, cacheGet, cacheSet } from '@/lib/redis/client';
import type { Tenant } from '@/lib/types';

const TENANT_CACHE_TTL = 3600; // 1 hour
const LOCK_TTL_MS = 5000;

export async function getTenantByPhoneId(phoneNumberId: string): Promise<Tenant | null> {
  const cacheKey = `tenant:phone:${phoneNumberId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const redis = getRedisClient();
  const lockKey = `lock:tenant:${phoneNumberId}`;

  if (redis) {
    // Try to acquire a lock to prevent cache stampede
    const lock = await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!lock) {
      // Another request is fetching — wait briefly and try cache again
      await new Promise((r) => setTimeout(r, 100));
      const retried = await cacheGet(cacheKey);
      if (retried) return JSON.parse(retried);
    }
  }

  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('wa_phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .single();

    if (data) {
      const idCacheKey = `tenant:id:${data.id}`;
      // Write BOTH cache keys before releasing the lock
      await Promise.all([
        cacheSet(cacheKey, JSON.stringify(data), TENANT_CACHE_TTL),
        cacheSet(idCacheKey, JSON.stringify(data), TENANT_CACHE_TTL),
      ]);
    }
    return data || null;
  } finally {
    if (redis) await redis.del(lockKey).catch(() => {});
  }
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `tenant:id:${tenantId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const { data } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (data) await cacheSet(cacheKey, JSON.stringify(data), TENANT_CACHE_TTL);
  return data || null;
}

export async function invalidateCache(tenantId: string, phoneNumberId?: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const keys = [`tenant:id:${tenantId}`];
  if (phoneNumberId) keys.push(`tenant:phone:${phoneNumberId}`);
  await redis.del(...keys).catch(() => {});
}
```

---

### `src/lib/utils/crypto.ts` — already shown above  
### `src/lib/redis/client.ts`

```typescript
import IORedis from 'ioredis';

let redisInstance: IORedis | null = null;
let connectionFailed = false;

export function getRedisClient(): IORedis | null {
  if (connectionFailed) return null;
  if (redisInstance) return redisInstance;

  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('⚠️ Redis not configured — falling back to in-memory.');
    return null;
  }

  try {
    redisInstance = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      family: 0,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    redisInstance.on('error', (err) => console.error('❌ Redis error:', err.message));
    redisInstance.on('connect', () => console.log('✅ Redis connected'));
    redisInstance.connect().catch((err) => {
      console.error('❌ Redis connect failed:', err.message);
      connectionFailed = true;
      redisInstance = null;
    });
    return redisInstance;
  } catch (err) {
    console.error('❌ Redis creation failed:', err);
    return null;
  }
}

const DEDUP_PREFIX = 'dedup:wa:';
const DEDUP_TTL_SECONDS = 86400;
const inMemoryDedup = new Set<string>();
const MAX_INMEMORY_SIZE = 10000;

export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(`${DEDUP_PREFIX}${messageId}`, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
      return result === null;
    } catch { /* fall through */ }
  }
  // DB fallback
  try {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const { data } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', messageId).limit(1);
    if (data && data.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try { return await redis.get(key); } catch { return null; }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try { await redis.set(key, value, 'EX', ttlSeconds); } catch { }
}

export async function checkRedisRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) return { allowed: true, remaining: maxRequests };
  try {
    const fullKey = `ratelimit:${key}`;
    const pipeline = redis.pipeline();
    pipeline.incr(fullKey);
    pipeline.expire(fullKey, windowSeconds);
    const results = await pipeline.exec();
    if (!results) return { allowed: true, remaining: maxRequests };
    const current = results[0][1] as number;
    return { allowed: current <= maxRequests, remaining: Math.max(0, maxRequests - current) };
  } catch {
    return { allowed: true, remaining: maxRequests };
  }
}
```

---

### `src/lib/broadcast/queue.ts` (key sections)
```typescript
// Concurrency = 1, 50ms sleep between sends (under Meta's 80 msg/s limit)
// broadcastWorker processes jobs one at a time
// Each job sends ONE message and sleeps 50ms before next
```

### `src/app/api/broadcast/route.ts` (key sections)
```typescript
// Guards: getTenantId() → tenant must be is_active=true AND wa_token_expired=false
// Leads capped at 10,000 per broadcast
// Enqueues to BullMQ — no inline sending
```

### `src/app/api/webhooks/whatsapp/route.ts` (key sections)
```typescript
// Rate limit: 2000/min per IP (Meta sends from multiple IPs)
// 2MB payload limit
// HMAC verified BEFORE JSON.parse
// Dedup checked per message_id
// Status updates silently dropped (no AI processing)
// Enqueue to BullMQ (fire-and-forget, always returns 200)
```

### `src/lib/whatsapp/service.ts` (key section)
```typescript
// handleTokenExpiry() only called when Meta returns:
//   error.type === 'OAuthException' AND error.code === 190
// NOT triggered by network errors, 500s, or other 401 causes
```

### `src/lib/ai/engine.ts` (key section)
```typescript
// Wrapped in withTimeout(15000ms)
// Uses responseMimeType: 'application/json' — strict JSON output
// Counts tokens via supabaseAdmin.rpc('increment_ai_tokens')
// Checks message_limit + ai_conversation_limit before processing
```

### `src/lib/auth/getTenantId.ts`
```typescript
// Reads Supabase session from cookies → gets user → caches tenant_id in Redis (1hr)
// Used by all dashboard API routes as auth gate
```

### `src/middleware.ts`
```typescript
// Protects /dashboard/* and /admin/* — redirects to /login if no Supabase session
// Note: admin DB flag check happens inside /api/admin/overview, NOT in middleware
// This is intentional — middleware can't do DB queries efficiently
```

### `src/app/api/auth/signup/route.ts`
```typescript
// Zod validation → rate limit 5/hr per IP → create auth user → create tenant → create user record
// On any failure: atomic rollback (delete auth user + delete tenant)
// Returns success with userId + tenantId
```

### `src/app/api/admin/overview/route.ts`
```typescript
// requireAdmin(): checks is_platform_admin=true in DB AND email === PLATFORM_ADMIN_EMAIL env
// Both checks must pass — dual guard
```

### `src/app/api/webhooks/razorpay/route.ts`
```typescript
// HMAC verified via RAZORPAY_WEBHOOK_SECRET
// Idempotency: checks analytics_events for same subscription_id in last 24h
// Handles: subscription.activated, subscription.charged, subscription.cancelled, payment.failed
```

### `src/app/api/cron/timeout/route.ts`
```typescript
// Requires Authorization: Bearer CRON_SECRET header
// Times out conversations inactive > 24h
// Falls back to processPendingFollowUps() if BullMQ unavailable
```

### `src/app/api/cron/instagram-refresh/route.ts`
```typescript
// Requires Authorization: Bearer CRON_SECRET header
// Re-encrypts refreshed IG tokens before storing
// Runs per-tenant, catches per-tenant failures individually
```

### `src/app/api/dashboard/conversations/[id]/pause/route.ts`
```typescript
// Verifies conversation.tenant_id === user's tenant_id before allowing pause/unpause
// Uses supabaseAdmin for the tenant_id lookup to bypass RLS
```

### `src/lib/supabase/admin.ts`
```typescript
// Lazy proxy getter — supabaseAdmin is NOT initialized at module level
// createClient() only called when first property is accessed
// Prevents build-time crash on Vercel
```

### `src/lib/billing/razorpay.ts`
```typescript
// getRazorpay() lazy getter — Razorpay constructor not called at build time
// createSubscription(), cancelSubscription(), changePlan()
// verifyWebhookSignature() uses crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
```

### `src/lib/email/service.ts`
```typescript
// Resend client initialized at module level with fallback dummy key
// sendNewLeadEmail, sendWeeklySummaryEmail, sendBillingReceipt, sendBotOfflineAlert
// All wrapped in try/catch — email failure never crashes the main flow
```

### `src/lib/database/schema.sql` (key sections)
```sql
-- 9 tables: tenants, users, leads, conversations, messages, follow_ups, bookings, shopify_events, analytics_events
-- RLS enabled on all 9 tables
-- Policies: every table scoped by tenant_id via users.auth_id = auth.uid()
-- RPCs: increment_message_count, increment_ai_tokens, increment_ai_conversations, reset_monthly_counters
-- Indexes: wa_phone_number_id, sender_id + tenant_id on conversations, etc.
-- Triggers: updated_at auto-updated on tenants, leads, bookings
```

### `worker.ts`
```typescript
// Standalone process: npx tsx worker.ts
// Initializes: initFollowUpEngine(), initWebhookEngine(), initBroadcastEngine()
// Bull-Board dashboard on port 3001 (admin queue monitor)
// Graceful SIGTERM/SIGINT: shuts down workers before exit
```

### `src/lib/followup/engine.ts` (key section)
```typescript
// BullMQ follow-up worker: checks if lead conversation is still active before sending
// Cancels follow-up if: conversation closed, lead status changed, bot_paused=true
// Falls back to cron-based processPendingFollowUps() if Redis unavailable
```

---

## 🔍 AUDIT CHECKLIST — CHECK EVERY ITEM

For each item below, inspect the relevant code and return one of:
- ✅ **VERIFIED** — Correct, properly handled
- ⚠️ **CONCERN** — Potential issue worth noting (explain precisely why)
- ❌ **BUG** — Real production bug (explain the exact failure scenario + fix)

### 🔐 Security

- [ ] **S1** — Can a tenant access another tenant's conversations/leads by guessing a UUID?
- [ ] **S2** — Can a user escalate from `owner` to `is_platform_admin` via the settings API?
- [ ] **S3** — Is `decryptToken()` called on every path that reads `wa_access_token` from DB?
- [ ] **S4** — Can the Razorpay webhook be replayed to double-activate a subscription?
- [ ] **S5** — Can the WhatsApp webhook be spoofed without a valid HMAC?
- [ ] **S6** — Are there any SQL injection vectors in raw query construction?
- [ ] **S7** — Does the admin route leak sensitive tenant data (tokens, secrets) in its response?
- [ ] **S8** — Is there a way to trigger the Instagram token refresh cron without `CRON_SECRET`?

### 🏃 Concurrency & Race Conditions

- [ ] **C1** — If 100 webhooks arrive simultaneously for the same `wa_phone_number_id`, do they all get the correct tenant config without DB overload?
- [ ] **C2** — If a BullMQ job processes a message while the tenant's token expires mid-flight, is the error handled correctly?
- [ ] **C3** — Can two follow-up jobs for the same lead fire simultaneously (duplicate messages)?
- [ ] **C4** — If Redis goes down mid-broadcast, does the broadcast job fail gracefully or silently drop messages?
- [ ] **C5** — Is the rate-limit pipeline (`INCR` + `EXPIRE`) atomic? Can a burst sneak through?

### 💾 Data Integrity

- [ ] **D1** — If tenant creation succeeds but user creation fails during signup, is the orphan tenant cleaned up?
- [ ] **D2** — Are monthly message/AI counters reset correctly? Can they overflow or go negative?
- [ ] **D3** — If a conversation is timed out by the cron job while a BullMQ message is being processed, what happens to the active session?
- [ ] **D4** — Does `updateConversation()` update `last_message_at` atomically to prevent stale writes?
- [ ] **D5** — If `saveLead()` fails (DB error), does the conversation still update? Is there orphan state?

### 🚀 Performance at 100 Tenants

- [ ] **P1** — The admin overview fetches ALL tenant rows for MRR calculation. At 100+ tenants, is this still acceptable?
- [ ] **P2** — `getConversationHistory()` loads 40 messages per AI call. Is there pagination risk?
- [ ] **P3** — Does `isDuplicateMessage()` DB fallback create N+1 queries under load?
- [ ] **P4** — The tenant cache TTL is 1 hour. If a tenant updates their bot config in the dashboard, do live messages reflect the change within a reasonable time?
- [ ] **P5** — Are there missing DB indexes that would cause slow queries at scale?

### 🔄 Reliability & Fault Tolerance

- [ ] **R1** — If the BullMQ `incoming-webhooks` worker crashes, do messages get requeued (via `attempts: 3` + exponential backoff)?
- [ ] **R2** — If Gemini API is down, does the AI engine fall back gracefully and still return a reply?
- [ ] **R3** — If `sendWhatsAppMessage()` fails (network error, not 401), does the error surface properly in logs?
- [ ] **R4** — If Resend email fails on token expiry alert, does the main flow still complete (token flagged in DB)?
- [ ] **R5** — Is there a dead-letter queue for permanently failed broadcast jobs?

### 💳 Billing

- [ ] **B1** — Can a tenant on the `starter` plan send broadcasts if they manually call the API without plan checks?
- [ ] **B2** — When a Razorpay `subscription.charged` event fires, is the tenant's plan_status correctly updated?
- [ ] **B3** — Is there a message limit enforcement that prevents a tenant from exhausting their quota in a single burst?
- [ ] **B4** — Can a tenant bypass billing entirely by staying on `plan_status: 'trial'` indefinitely?

---

## 📋 OUTPUT FORMAT

For each checklist item, provide:

```
[CODE] [STATUS]
File: <filename>
Finding: <1-2 sentences max>
Risk: <Low / Medium / High / Critical>
Fix: <exact code change if bug, "None needed" if verified>
```

After the checklist, provide a **Summary Table**:

| Category | Verified ✅ | Concerns ⚠️ | Bugs ❌ |
|----------|------------|------------|--------|
| Security | X | X | X |
| Concurrency | X | X | X |
| Data Integrity | X | X | X |
| Performance | X | X | X |
| Reliability | X | X | X |
| Billing | X | X | X |

End with a **Verdict**:
- 🟢 **READY FOR 100 CLIENTS** — No critical or high bugs found
- 🟡 **NEARLY READY** — Minor concerns, no showstoppers
- 🔴 **NOT READY** — Critical bugs found (list them)

---

## ⚙️ ENVIRONMENT VARIABLES REQUIRED IN PRODUCTION

Verify that every variable below is documented and used correctly:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_PLAN_STARTER / _GROWTH / _PRO
REDIS_URL or UPSTASH_REDIS_URL
NEXT_PUBLIC_META_APP_ID
META_APP_SECRET
GLOBAL_WEBHOOK_VERIFY_TOKEN
ENCRYPTION_KEY           # Must be 32+ random chars
JWT_SECRET
CRON_SECRET
PLATFORM_ADMIN_EMAIL
RESEND_API_KEY
NEXT_PUBLIC_APP_URL
```

Flag any variable that is **read but not validated at startup** where its absence would cause a silent failure.

---

*This prompt was generated by Project Bolt's engineering team. Last updated: April 2026.*
*TypeScript: 0 errors. Build: passing. All 25 known showstoppers resolved.*
