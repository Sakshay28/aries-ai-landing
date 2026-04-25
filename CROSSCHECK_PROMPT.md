# ⚡ PROJECT BOLT — INDEPENDENT CROSS-CHECK PROMPT
> Paste this into Claude, ChatGPT, or Gemini for an independent verification.
> The co-founder who built this system also audited it. We need a second pair of eyes.

---

## 🎯 YOUR MISSION

You are an **independent code reviewer** performing a cross-check of a production audit done on Project Bolt — a multi-tenant WhatsApp/Instagram AI SaaS platform built with Next.js, Supabase, BullMQ, and Gemini AI.

The **co-founder and primary developer** performed the initial audit and applied 7 fixes. Your job is to:

1. **Verify each of the 7 fixes** — Are they correct? Do they introduce new bugs?
2. **Challenge the 25 "verified" items** — Did they miss anything real?
3. **Check for blind spots** — What would a co-founder unconsciously overlook in their own code?
4. **Be brutally honest** — Don't rubber-stamp. If something is wrong, say so.

### Scale Context
- Target: **100 paying tenants** (not 10,000 — don't over-engineer)
- Each tenant: ~500-2,000 messages/month, ~50-200 leads
- Peak concurrent webhooks: ~50-100/second across all tenants
- Infrastructure: Vercel (Next.js) + Railway/Render (BullMQ worker) + Upstash Redis + Supabase

### What NOT to flag
- Minor style preferences or TypeScript strictness
- `any` types used for intentional flexibility
- Suggesting tests (out of scope)
- Things that only matter at 10,000+ tenants

---

## 📋 THE 7 FIXES APPLIED — VERIFY EACH ONE

### Fix 1: RPC Parameter Name Mismatch (D2 — BILLING BUG)

**Claim:** `increment_message_count` DB function expects `t_id` but code called it with `p_tenant_id`, causing silent billing bypass when Redis is down.

**DB Function (schema.sql line 496):**
```sql
CREATE OR REPLACE FUNCTION increment_message_count(t_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tenants SET messages_used_this_month = messages_used_this_month + 1 WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Code BEFORE (manager.ts:288):**
```typescript
await supabaseAdmin.rpc('increment_message_count', { p_tenant_id: tenantId });
```

**Code AFTER:**
```typescript
await supabaseAdmin.rpc('increment_message_count', { t_id: tenantId });
```

**Context:** This is the fallback path (line 287-289) inside `incrementMessageCount()`. The primary path (lines 278-286) uses Redis INCR and syncs to DB via `set_message_count` (which correctly uses `t_id`). The fallback only fires when Redis is unavailable.

**Cross-check questions:**
- Does Supabase PostgREST actually fail silently on wrong param names, or does it throw?
- Is there any other RPC call in the codebase with a similar mismatch? (Check `increment_ai_tokens` which uses `t_id`, and `increment_ai_conversations` which uses `p_tenant_id` — both match their DB function signatures.)

---

### Fix 2: Atomic Rate Limiter (C5)

**Claim:** Pipeline INCR+EXPIRE wasn't atomic. If EXPIRE failed after INCR succeeded, the key would persist forever with no TTL, permanently locking out that rate-limit bucket.

**Code BEFORE:**
```typescript
const pipeline = redis.pipeline();
pipeline.incr(fullKey);
pipeline.expire(fullKey, windowSeconds);
const results = await pipeline.exec();
const current = results[0][1] as number;
```

**Code AFTER:**
```typescript
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

const current = await redis.eval(RATE_LIMIT_LUA, 1, fullKey, windowSeconds.toString()) as number;
```

**Cross-check questions:**
- Does Upstash Redis support `EVAL` with Lua scripts? (Yes, but verify.)
- The Lua script only sets EXPIRE when `current == 1` (first request). Is this correct? What if a key exists from a previous window with 0 TTL — INCR would return 2+, and EXPIRE would never be set. **Is this actually a regression?**
  - Counter-argument: A key with no TTL from a *previous* bug would need manual cleanup regardless. New keys always start fresh with INCR returning 1.
- Is `windowSeconds.toString()` correct? Lua ARGV values are strings, but `redis.call('EXPIRE')` expects an integer. Does Redis auto-coerce?

---

### Fix 3: Follow-Up Job Deduplication (C3)

**Claim:** BullMQ doesn't deduplicate by job name, only by `jobId`. Without `jobId`, the same follow-up could be enqueued twice if `scheduleFollowUp` is called twice for the same lead.

**Code AFTER (followup/engine.ts:186):**
```typescript
{
  delay: data.delayMs,
  jobId: data.followUpId, // Prevents duplicate enqueue for the same follow-up
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50,
}
```

**Cross-check questions:**
- When BullMQ encounters a duplicate `jobId`, does it throw an error or silently skip? If it throws, the `scheduleFollowUps` function in processor.ts would crash. **But we also added try/catch around `scheduleFollowUps` in Fix 5, so this is safe.**
- Does `removeOnComplete: 100` mean the jobId becomes available again after completion? If so, could a *new* follow-up with the same UUID collide? (No — follow-up IDs are generated fresh with `uuidv4()` each time.)

---

### Fix 4: In-Memory Dedup Tier (P3)

**Claim:** The `inMemoryDedup` Set was declared but never used. Now it's wired as a middle tier between Redis and DB to reduce N+1 queries when Redis is down.

**Code AFTER (redis/client.ts:94-124):**
```typescript
// In-memory fast check (avoids DB hit on every message when Redis is down)
if (inMemoryDedup.has(messageId)) {
  return true;
}

// Database fallback when both Redis and in-memory miss
try {
  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  const { data } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', messageId).limit(1);
  if (data && data.length > 0) {
    return true;
  }
  // Not a duplicate — track in memory for future checks
  if (inMemoryDedup.size >= MAX_INMEMORY_SIZE) {
    const first = inMemoryDedup.values().next().value;
    if (first) inMemoryDedup.delete(first);
  }
  inMemoryDedup.add(messageId);
  return false;
} catch (err) {
  return false;
}
```

**Cross-check questions:**
- The in-memory Set lives in the **worker process** (long-lived), not in Vercel serverless. Is this correct? The webhook route calls `isDuplicateMessage` which runs in the Next.js route handler, but the actual processing happens in the BullMQ worker. **Which process calls isDuplicateMessage?** (Answer: the webhook route handler, before enqueuing.)
- On Vercel, each serverless invocation is a separate cold start. The in-memory Set would be empty on each invocation. **Does this tier actually help on Vercel?** (Only if the same function instance handles multiple requests before being recycled.)
- The eviction strategy (delete oldest, Set iteration order) — is `Set.values().next()` guaranteed to return the insertion-order-first element? (Yes, per ECMAScript spec.)

---

### Fix 5: saveLead + scheduleFollowUps Error Isolation (D5)

**Claim:** If `saveLead` threw a DB error, it would prevent `scheduleFollowUps` from running. Both are now wrapped in independent try/catch blocks.

**Code AFTER (processor.ts:217-234):**
```typescript
if (aiResponse.nextStep === 'confirmation' || aiResponse.nextStep === 'completed') {
  try {
    await saveLead(tenant, conversation, updatedContext, senderId);
  } catch (err) {
    console.error(`⚠️ [${tenant.business_name}] saveLead failed (non-fatal):`, err);
  }
}

if (aiResponse.nextStep === 'confirmation') {
  try {
    await scheduleFollowUps(tenant, conversation, updatedContext);
  } catch (err) {
    console.error(`⚠️ [${tenant.business_name}] scheduleFollowUps failed (non-fatal):`, err);
  }
}
```

**Cross-check questions:**
- Should Sentry.captureException be called here? Currently only console.error.
- If saveLead fails, the lead row stays as `lead_status: 'new'` instead of being updated to `'warm'`. The dashboard shows a "new" lead that the business owner might not follow up on. Is this acceptable?

---

### Fix 6: Broadcast Quota Pre-Check (B1)

**Claim:** No check existed to verify the tenant had enough message quota before enqueuing a broadcast.

**Code AFTER (broadcast/route.ts:70-78):**
```typescript
const { checkUsageLimits } = await import('@/lib/tenant/manager');
const usage = await checkUsageLimits(tenant);
if (!usage.withinLimits) {
  return NextResponse.json(
    { success: false, error: `Message limit reached (${tenant.message_limit} per month). Upgrade your plan to send more.` },
    { status: 429 }
  );
}
```

**Cross-check questions:**
- This checks if the tenant has ANY messages remaining, but doesn't check if they have ENOUGH for the broadcast. A tenant with 1 message remaining and 500 leads would pass this check. The broadcast would then send 1 message and the worker would continue trying (and failing silently via the usage check in the processor). **Is this a problem?**
- Why dynamic `import()` instead of a static import at the top? (Likely to avoid circular dependency — verify.)

---

### Fix 7: Trial Expiry Enforcement (B4)

**Claim:** The `trial_ends_at` column exists in the schema (line 58, default 14 days) but was never checked in the message processor.

**Code AFTER (processor.ts:100-111):**
```typescript
if (tenant.trial_ends_at && tenant.plan_status !== 'active') {
  const trialEnd = new Date(tenant.trial_ends_at).getTime();
  if (Date.now() > trialEnd && !tenant.razorpay_subscription_id) {
    console.warn(`⚠️ [${tenant.business_name}] Trial expired, no active subscription`);
    try {
      await sendTextMessage(tenant, senderId, `Thanks for reaching out! Our system is currently being upgraded. Please contact the business directly. 🙏`);
    } catch { /* ignore */ }
    return;
  }
}
```

**Cross-check questions:**
- The condition is `plan_status !== 'active'`. But new tenants have `plan_status = 'active'` by default (schema line 55). So this check would NEVER fire for new tenants whose trial expires, because their plan_status is still 'active'. **Is the logic inverted?**
  - Counter-argument: Maybe 'active' means "paid and active" and the signup flow sets a different initial status? Check the signup route.
  - The signup route (auth/signup/route.ts) does NOT set `plan_status` — it uses the DB default which is `'active'`. **This means Fix 7 is potentially ineffective.** Verify.
- Should the broadcast route also check trial_ends_at?
- The message sent to the customer ("system is being upgraded") is misleading. Should it say "trial expired"?

---

## 🔍 ITEMS CLAIMED AS "VERIFIED" — CHALLENGE THESE

The auditor claimed 25 items as verified (✅). Here are the ones most likely to have blind spots:

### Security Claims to Challenge
1. **S5 (HMAC Verification):** In production, if `META_APP_SECRET` is not set, the signature check block is skipped (`if (appSecret)` is falsy on line 76). A missing env var = webhooks accepted without verification. Is this logged/alerted?

2. **S7 (Admin Token Leak):** The admin route selects `wa_phone_number_id` — this is a Meta-internal ID, not a secret, but could it be used to enumerate which phone numbers are on the platform?

### Concurrency Claims to Challenge
3. **C1 (Stampede Protection):** Line 99 of manager.ts — if the lock holder takes >5s (the lock TTL), the lock expires and a second request can stampede. The DB query + 2 cache writes must complete in <5s. At 100 tenants, is this realistic? (Almost certainly yes, but verify.)

4. **C1 continued:** Line 99 — if the cache miss AND the lock miss happen, the fallback returns `null` (the `getCached` returns null because cache isn't set yet). This means the message is silently dropped. **Is there a retry mechanism in the webhook route?** (BullMQ retry with 3 attempts, 2s backoff.)

### Data Integrity Claims to Challenge
5. **D1 (Signup Rollback):** If Step 3 (user record creation) fails, the code deletes the auth user AND the tenant. But what if the tenant deletion fails? We'd have an orphan auth user with no tenant. Is there a catch around the cleanup?

6. **D4 (Atomic last_message_at):** The auditor said "each conversation has one sender and the bot processes sequentially via BullMQ." But BullMQ concurrency is set to 10 for webhook workers (webhook/queue.ts:32). Two messages from different senders to the same tenant are processed in parallel. If they somehow share a conversation (shouldn't happen, but verify), there could be a race.

---

## 📊 DATABASE SCHEMA — VERIFY THESE INDEXES EXIST

The auditor claims all critical indexes exist. Verify:

| Query Path | Expected Index | Schema Line |
|-----------|---------------|-------------|
| `isDuplicateMessage` → `messages.wa_message_id` | `idx_messages_wa_message_id` (UNIQUE) | 248 |
| Follow-up cron → `follow_ups WHERE status='pending'` | `idx_followup_pending` | 280 |
| Tenant lookup → `tenants.wa_phone_number_id` | `idx_tenants_wa_phone` (UNIQUE) | 99 |
| Active conversations → composite partial index | `idx_conv_active` | 214 |

---

## 🔑 ENV VARS — VERIFY FAILURE MODES

| Variable | What happens if missing in production? |
|----------|--------------------------------------|
| `ENCRYPTION_KEY` | Hard crash on first encrypt/decrypt (line 12 of crypto.ts) ✅ |
| `META_APP_SECRET` | Webhooks bypass HMAC verification silently ⚠️ |
| `RAZORPAY_WEBHOOK_SECRET` | Billing webhooks accepted unsigned ⚠️ |
| `CRON_SECRET` | Cron jobs return 401 ✅ |
| `REDIS_URL` | Falls back to DB polling (works but slow) ✅ |
| `RESEND_API_KEY` | Token expiry emails silently fail ⚠️ |

---

## ✋ MANUAL CHECKLIST FOR THE FOUNDER

These are things code can't fix — you must do these manually before going live with 100 clients:

### 🔴 CRITICAL (Do before first paying client)

- [ ] **Set `ENCRYPTION_KEY`** — Must be 16+ chars, ideally 32+ random chars. Generate with: `openssl rand -hex 32`
- [ ] **Set `META_APP_SECRET`** — Get from Meta Developer Dashboard → App Settings → Basic → App Secret
- [ ] **Set `RAZORPAY_WEBHOOK_SECRET`** — Get from Razorpay Dashboard → Webhooks → Secret
- [ ] **Set `CRON_SECRET`** — Any random string, used to authenticate cron job calls. Generate with: `openssl rand -hex 16`
- [ ] **Set `PLATFORM_ADMIN_EMAIL`** — Your email address, used for admin dashboard access
- [ ] **Deploy `worker.ts`** as a persistent process on Railway/Render/EC2: `npx tsx worker.ts`
- [ ] **Verify Redis (Upstash) is connected** — Check worker logs for "✅ Redis connected"
- [ ] **Run the schema SQL** in Supabase SQL Editor if not already done
- [ ] **Enable RLS** on all tables (the schema does this, but verify in Supabase Dashboard → Authentication → Policies)
- [ ] **Set up Vercel cron** for monthly counter reset: Add to `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/reset-counters", "schedule": "0 0 1 * *" }] }
  ```

### 🟡 IMPORTANT (Do before 10 clients)

- [ ] **Set up Sentry** — `SENTRY_DSN` env var in both Vercel and worker
- [ ] **Set up Resend** — `RESEND_API_KEY` for token expiry email alerts
- [ ] **Configure Meta webhook URL** in Meta Developer Dashboard pointing to `https://yourdomain.com/api/webhooks/whatsapp`
- [ ] **Test the full flow manually**: Signup → Connect WhatsApp → Send test message → Check dashboard
- [ ] **Monitor Bull Board** at `worker-host:3001/admin/queue` — verify all 5 queues are visible
- [ ] **Set up backup strategy** for Supabase (daily backups, point-in-time recovery)
- [ ] **Set up uptime monitoring** (UptimeRobot/Better Uptime) for:
  - Your Next.js app URL
  - Your worker process health endpoint
  - Supabase project status

### 🟢 NICE TO HAVE (Do before 50 clients)

- [ ] **Add Slack alerts** — Set `SLACK_WEBHOOK_URL` for real-time failure notifications
- [ ] **Set up log aggregation** — Vercel logs are ephemeral; consider Axiom or Datadog
- [ ] **Create a status page** for clients to check system health
- [ ] **Document the onboarding flow** for new clients (WhatsApp connection steps)
- [ ] **Load test** with 100 concurrent webhook POSTs to verify <500ms p95 latency

---

## 📝 YOUR OUTPUT FORMAT

Please respond with:

```
## FIXES REVIEW
For each fix (1-7):
- ✅ CORRECT / ⚠️ CONCERN / ❌ WRONG
- Explanation
- Any new bugs introduced?

## VERIFIED ITEMS CHALLENGE
For each challenged item:
- ✅ AGREE / ⚠️ DISAGREE
- Explanation

## BLIND SPOTS FOUND
- List anything the auditor missed entirely

## FINAL VERDICT
- READY / NOT READY / CONDITIONALLY READY
- Blocking issues (if any)
```

---

*Cross-check prompt generated: 2026-04-23 23:28 IST*
*Codebase: ~8,500 lines across 58 source files*
*Stack: Next.js 16 + Supabase + BullMQ + Upstash Redis + Gemini 2.0 Flash*
