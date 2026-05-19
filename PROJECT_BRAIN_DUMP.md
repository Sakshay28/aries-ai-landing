# ARIES AI — COMPLETE PROJECT BRAIN DUMP
**Forensic-grade transfer document for any AI to instantly understand the entire project.**

---

# 1. PROJECT OVERVIEW

## What It Is
Aries AI is a multi-tenant WhatsApp AI automation SaaS for Indian SMBs (restaurants, salons, clinics, real estate). An AI chatbot handles customer WhatsApp conversations 24/7, qualifies leads, books appointments, runs broadcasts, and escalates to humans when needed.

Secondary brand: **Libra AI** (libraai.in) — Instagram DM automation for creators. Same codebase, different routing via proxy.

## Solo Founder
Sakshay (India). One-person team. All code written by him. Pre-revenue, pre-launch (May 2026).

## Business Model
- **India:** Starter ₹999 | Growth ₹2,499 | Pro ₹6,999 | Enterprise custom
- **US outreach:** $149/mo single location | $249/mo multi
- **Libra AI:** Free (3k convos) | ₹349/mo unlimited
- Payments: Razorpay subscriptions

## ICP
Indian SMBs: restaurants, salons, dental clinics, real estate agents — 1-10 staff, 20-200+ daily WhatsApp inquiries, no existing chatbot.
US: Personal injury lawyers, dentists, med spas — solo practices, no live chat on website.

## Tech Stack
Next.js 16.2.4 (App Router, Turbopack), TypeScript strict, React 19.2.4, Supabase (PostgreSQL + Auth + RLS + pgvector + Realtime + Storage), Google Gemini 2.0 Flash + text-embedding-004, BullMQ + Redis (Upstash), Razorpay, Resend, Sentry, Recharts, Vitest. WhatsApp via Gupshup BSP (NOT direct Meta). Voice: LiveKit + Sarvam AI + Groq (Python, separate).

## Repo & Hosting
- Local: `/Users/sakshay/Desktop/project-bolt`
- GitHub: `https://github.com/Sakshay-28/aries-ai-landing.git`
- Vercel: `aries-ai-landing.vercel.app` (also `ariesai.in`)
- Supabase: managed PostgreSQL
- Upstash: Redis for BullMQ

## What's Built (all code-complete, builds verified May 19 2026)
Both landing pages, Auth, full Dashboard (Overview/Leads/Conversations/Broadcast/Templates/Analytics/Settings/Agents/Flows/Integrations), Admin panel, WhatsApp webhook pipeline, Gemini AI engine with circuit breaker, BullMQ worker, Razorpay subscriptions + payment links, AES-256-GCM token encryption, Multi-brand proxy routing, GDPR deletion, Rate limiting, Sentry, Vitest tests.

Flow engine: 17 node types (trigger, standard, condition, handoff, delay, tag, webhook, interruption, knowledge, memory, format, extract, ai_reply, wait_for_reply, book_appointment, send_media, send_audio).

Phase 3: Razorpay payment links, multi-agent routing, Google Calendar OAuth + booking, RAG pipeline (pgvector), Pabbly Connect integration, CTWA ads tracking, lead round-robin assignment, Google Sheets OAuth sync, real Supabase Auth team invites.

## What's NOT Built
- Gupshup embedded signup in UI (onboarding is manual)
- Instagram reel comment automation (Libra-specific)
- Landing page FAQ section
- CI workflow file
- Template status sync cron job (fetches on-demand)

## What's Fake/Manual/Stubbed
- `getTenantId()` has dev bypass returning `'test-tenant-123'` — MUST be removed before production
- Client WhatsApp onboarding: 100% manual (Sakshay creates Gupshup accounts himself)
- Razorpay billing not enforced (no paywall middleware)
- Legacy `wa_business_account_id`/`wa_access_token` columns in DB (unused, from pre-Gupshup era)

---

# 2. ARCHITECTURE

## Folder Structure
```
src/
├── app/
│   ├── (auth)/                    # Login/signup pages
│   ├── dashboard/                 # All dashboard pages
│   │   ├── page.tsx               # Overview
│   │   ├── chat/                  # Conversations inbox
│   │   ├── leads/                 # Lead management
│   │   ├── broadcast/             # Campaign management
│   │   │   └── _components/       # BroadcastClient.tsx, BroadcastPanel.tsx
│   │   ├── templates/             # WhatsApp template management
│   │   ├── analytics/             # Charts/metrics
│   │   ├── settings/              # All config tabs
│   │   ├── agents/                # Multi-agent configs
│   │   ├── flows/                 # Automation builder
│   │   └── integrations/          # Third-party connections
│   ├── api/
│   │   ├── webhooks/gupshup/      # Inbound WhatsApp webhook (public)
│   │   ├── dashboard/settings/    # Tenant settings CRUD
│   │   ├── dashboard/templates/   # Templates via Gupshup API
│   │   ├── dashboard/leads/       # Lead CRUD + assignment
│   │   ├── chat/send/             # Send outbound WhatsApp message
│   │   ├── broadcasts/send/       # Start campaign send
│   │   └── admin/                 # Admin panel APIs
│   └── admin/                     # Admin pages
├── lib/
│   ├── ai/                        # Gemini engine, RAG (rag.ts)
│   ├── auth/getTenantId.ts        # Session → tenant mapping
│   ├── gupshup/service.ts         # All Gupshup API calls
│   ├── supabase/                  # admin.ts, server.ts, client.ts
│   ├── flows/engine.ts            # Flow node execution
│   ├── followup/engine.ts         # Scheduled follow-ups
│   ├── payments/                  # Razorpay
│   ├── integrations/runner.ts     # Pabbly, Google Sheets
│   ├── tenant/manager.ts          # Config cache + invalidation
│   ├── utils/crypto.ts            # AES-256-GCM encrypt/decrypt
│   └── database/migrations/       # SQL files (6 pending)
├── proxy.ts                       # Multi-brand routing — NEVER MODIFY CASUALLY
└── components/                    # Shared UI components
```

## Critical Architecture Rules
1. **Lazy init ALWAYS** — never eagerly init supabaseAdmin/Razorpay/GenAI at module level. Use Proxy getter pattern.
2. Never `NEXT_PUBLIC_` for secrets
3. Always `.eq('tenant_id', tenantId)` on every DB query — no RLS relied upon
4. All async jobs → BullMQ worker (never inside API routes)
5. Never break `src/proxy.ts` — backbone of dual-brand routing
6. Always encrypt OAuth tokens with `crypto.ts` (AES-256-GCM) before storing

## Multi-Tenant Logic
- Every table has `tenant_id` column
- `getTenantId()` reads Supabase auth session → returns tenant UUID
- Every query manually filters by tenant_id
- Webhook routing: `body.app` field matched against `tenants.gupshup_app_name`
- Tenant config cached in memory, invalidated on settings save

## WhatsApp Message Lifecycle
```
Customer → WhatsApp → Meta → Gupshup → POST /api/webhooks/gupshup
  → parseGupshupWebhook(body) → lookup tenant by app name
  → upsert conversation + lead → insert message
  → Gemini AI generates reply → sendTextMessage() via Gupshup
  → Gupshup → Meta → Customer WhatsApp
  → status webhook: sent → delivered → read
```

## Gupshup Integration Details
- BSP (Business Service Provider) — sits between Aries and Meta
- API base: `https://api.gupshup.io/wa/api/v1`
- Auth: `apikey: {key}` header (NOT Bearer)
- Content-Type for sends: `application/x-www-form-urlencoded`
- Phone format: no + prefix (e.g. `919876543210`)
- Rate limit: 5 msg/sec (200ms delay enforced)
- Sakshay is on regular customer plan (NOT partner program)
- Creates separate Gupshup account per client (using their email)
- Credentials stored per-tenant: `gupshup_api_key` (encrypted), `gupshup_app_name`, `gupshup_phone_number`

## Gupshup Service Functions (src/lib/gupshup/service.ts)
- `sendTextMessage(apiKey, phoneNumber, destination, text, appName)`
- `sendTemplateMessage(apiKey, phoneNumber, destination, templateName, variables, languageCode, appName)`
- `sendMediaMessage(apiKey, phoneNumber, destination, mediaType, url, caption, appName)`
- `testConnection(apiKey, phoneNumber, appName)`
- `getOptedContacts(apiKey)`
- `sendStaffAlert(tenant, text)` — alerts staff_phone + manager_phone
- `parseGupshupWebhook(body)` — parses inbound webhook payload
- `isGupshupConfigured(tenant)` — checks api_key + phone presence
- `withGupshupRetry(fn)` — retry with exponential backoff
- `cleanPhone(phone)` — strips + prefix

## What Changed Today (May 20 2026) — "Hide Gupshup from Clients"

### Files Modified
1. **`src/app/api/dashboard/templates/route.ts`** — Rewired from broken Meta Graph API to Gupshup Template API. GET lists templates, POST creates them.
2. **`src/app/dashboard/settings/page.tsx`** — Removed API key input, App ID input, Test Connection button, setup guide. Replaced with read-only "WhatsApp Active" badge or "Setup in Progress" message.
3. **`src/app/api/dashboard/settings/route.ts`** — GET no longer returns `gupshup_api_key`. PATCH no longer accepts `gupshup_api_key`/`gupshup_phone_number`/`gupshup_app_name`.
4. **`src/app/api/chat/send/route.ts`** — Error string: "Gupshup is not configured" → "WhatsApp is not yet active for your account."
5. **`src/app/api/broadcasts/send/route.ts`** — Same error string change.
6. **`src/app/dashboard/broadcast/_components/BroadcastClient.tsx`** — Fetches approved templates on mount, passes to BroadcastPanel.
7. **`src/app/dashboard/broadcast/_components/BroadcastPanel.tsx`** — Template picker dropdown (replaces free-text input), shows body preview on select.

---

# 3. DATABASE SCHEMA

## tenants
Core multi-tenancy table. One row per client.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| business_name, business_type, business_phone, business_address, business_website, business_email | text | Business info |
| bot_name | text | AI assistant name |
| bot_personality | text | sales_pro/educator/support_hero/lead_magnet/advisor/concierge |
| welcome_message, welcome_offer | text | First-contact messages |
| usps | jsonb | String array |
| core_services | text | Service description for AI |
| industry | text | Industry code |
| working_hours | jsonb | Schedule |
| staff_phone, staff_name, manager_phone | text | Escalation contacts |
| followup_30min, followup_3hr, followup_24hr, followup_7day | boolean | Follow-up toggles |
| escalation_timeout_mins | integer | Default 5 |
| hot_keywords, warm_keywords | jsonb | Lead scoring keywords |
| custom_faqs | jsonb | Array of {question, answer} |
| off_hours_message | text | Auto-reply when closed |
| off_hours_capture_lead | boolean | |
| gupshup_api_key | text | Encrypted, set by admin only |
| gupshup_phone_number | text | No + prefix |
| gupshup_app_name | text | Gupshup app identifier |
| wa_business_account_id | text | LEGACY (unused) |
| wa_access_token | text | LEGACY (unused) |
| outbound_webhook_url | text | Zapier/Make URL |
| lead_assignment_counter | integer | Round-robin position |
| created_at | timestamptz | |

## conversations
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK→tenants |
| sender_id | text (customer phone) |
| status | text (open/closed/escalated) |
| lead_id | uuid FK→leads |
| created_at, updated_at | timestamptz |

## messages
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK→tenants |
| conversation_id | uuid FK→conversations |
| sender | text (customer/bot/agent) |
| content | text |
| type | text (text/image/video/audio/file/template) |
| status | text (sent/delivered/read/failed) |
| wa_message_id | text |
| media_url | text |
| created_at | timestamptz |

## leads
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK→tenants |
| phone, name, email | text |
| score | text (hot/warm/cold) |
| source | text (organic/meta_ctwa/manual) |
| assigned_to | uuid FK→team member |
| tags | jsonb |
| created_at | timestamptz |

## broadcast_campaigns
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK→tenants |
| name, template_name | text |
| status | text (draft/scheduled/sending/completed/failed) |
| audience_count, sent_count, delivered_count, read_count, failed_count | integer |
| scheduled_at, created_at | timestamptz |

## broadcast_messages
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id, campaign_id, lead_id | uuid FKs |
| recipient_phone, wa_message_id | text |
| status | text |

## flows
| id, tenant_id, name, nodes (jsonb), edges (jsonb), active (boolean), created_at |

## agent_configs
| id, tenant_id, name, personality, trigger_keywords (jsonb), is_active (boolean) |

## Pending Migrations (NOT YET RUN)
1. `2026_05_18_knowledge_base.sql`
2. `2026_05_18_business_profiles.sql`
3. `2026_05_18_broadcast_replied.sql`
4. `2026_05_18_agent_configs.sql`
5. `2026_05_18_rag_pipeline.sql` — pgvector + match_knowledge_docs RPC
6. `2026_05_19_lead_assignment.sql` — assigned_to on leads + lead_assignment_counter

---

# 4. API INVENTORY

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | /api/dashboard/settings | Fetch tenant settings (excludes gupshup_api_key) | tenant |
| PATCH | /api/dashboard/settings | Update settings (blocks gupshup_* fields) | tenant |
| GET | /api/dashboard/templates | List templates from Gupshup API | tenant |
| POST | /api/dashboard/templates | Create template via Gupshup API | tenant |
| POST | /api/chat/send | Send outbound WhatsApp message | tenant |
| POST | /api/broadcasts/send | Start campaign send (fire-and-forget) | tenant |
| POST | /api/webhooks/gupshup | Receive inbound WhatsApp messages | PUBLIC |
| POST | /api/dashboard/settings/test-gupshup | Test connection (admin use only now) | tenant |
| PATCH | /api/dashboard/leads/[id]/assign | Assign lead to team member | tenant |
| * | /api/dashboard/conversations/* | Conversation CRUD | tenant |
| * | /api/dashboard/leads/* | Lead CRUD | tenant |
| * | /api/dashboard/analytics/* | Metrics | tenant |
| * | /api/dashboard/agents/* | Agent config CRUD | tenant |
| * | /api/dashboard/flows/* | Flow CRUD | tenant |
| * | /api/auth/* | Login/signup/logout | public |
| * | /api/admin/* | Admin panel | admin |
| * | /api/payments/* | Razorpay webhook | public |
| * | /api/integrations/* | Google OAuth callbacks | varies |

---

# 5. ENVIRONMENT VARIABLES

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# AI
GOOGLE_GENERATIVE_AI_API_KEY

# Encryption (AES-256-GCM — if lost, all encrypted tokens unrecoverable)
ENCRYPTION_KEY

# Razorpay
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET

# Redis / BullMQ
UPSTASH_REDIS_URL (or REDIS_URL)

# Email
RESEND_API_KEY

# Google OAuth
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

# Sentry
SENTRY_DSN

# App
NEXT_PUBLIC_APP_URL
```

---

# 6. BUGS, ISSUES & TECH DEBT

| Issue | Severity | Status |
|-------|----------|--------|
| `getTenantId()` dev bypass returns 'test-tenant-123' | **CRITICAL** | Must remove before production |
| BullMQ worker not deployed | HIGH | Follow-ups/delayed flows won't fire |
| 6 DB migrations not run | HIGH | Features won't work without them |
| `knowledge-docs` storage bucket not created | HIGH | RAG pipeline broken |
| No webhook signature verification on /api/webhooks/gupshup | HIGH | Fake messages possible |
| No billing enforcement (paywall) | MEDIUM | All features free forever |
| Inconsistent toast library (sonner vs react-hot-toast) | LOW | Cosmetic |
| Legacy wa_business_account_id/wa_access_token columns | LOW | Unused, harmless |
| `createServerSupabaseClient` unused import in settings route | LOW | Lint warning |
| No 24-hour window enforcement in chat send | MEDIUM | May fail silently after window |
| Broadcast capped at 500 recipients (Vercel timeout) | MEDIUM | Need pagination for scale |
| No audience segmentation in broadcasts | MEDIUM | Sends to ALL leads |

---

# 7. PRE-LAUNCH BLOCKERS (Manual Steps)

1. Remove `getTenantId` dev bypass
2. Run all 6 DB migrations in Supabase SQL Editor
3. Create `knowledge-docs` Supabase Storage bucket (public)
4. Set ALL env vars in Vercel
5. Deploy BullMQ worker to Render/Railway
6. Gupshup webhook URL → `https://ariesai.in/api/webhooks/gupshup`
7. Razorpay KYC + create subscription plans
8. Resend domain verification
9. DNS for libraai.in → Vercel
10. Meta App → Live mode

---

# 8. CLIENT ONBOARDING PROCESS

Full checklist in `/CLIENT_ONBOARDING.md`. Summary:

1. **Meeting:** Collect business info, WhatsApp number, email, FAQs
2. **Gupshup:** Create account with client's email → Embedded Signup handles Meta WABA creation → get API key + app name
3. **Aries AI:** Client signs up at ariesai.in/signup
4. **Supabase:** Enter gupshup_api_key, gupshup_app_name, gupshup_phone_number on their tenant row
5. **Webhook:** Set `https://ariesai.in/api/webhooks/gupshup` in Gupshup dashboard
6. **Configure:** Fill in all Settings tabs (business, bot, staff, FAQs, follow-ups, off-hours)
7. **Test:** Send WhatsApp message to their number, verify bot replies
8. **Handover:** Show client the dashboard, give login credentials

Client NEVER sees Gupshup. Client NEVER goes to Meta Business Manager. Everything self-served from Aries AI dashboard after initial setup.

---

# 9. HIDDEN KNOWLEDGE & UNWRITTEN ASSUMPTIONS

- `gupshup_app_name` in DB = the name you give the app in Gupshup (e.g. `zara_restaurant_wa`), NOT a Gupshup-generated ID
- `gupshup_phone_number` is stored WITHOUT + prefix as digits only (e.g. `919876543210`)
- `gupshup_api_key` is encrypted at rest via AES-256-GCM — `decryptToken()` before use, `encryptToken()` before storing
- The webhook identifies the tenant by matching `body.app` against `tenants.gupshup_app_name` — if app name is wrong/missing, messages are silently lost
- Broadcast `after()` function runs AFTER the HTTP 200 is returned to the client — true fire-and-forget. If Vercel kills the function after 5 mins, remaining sends are lost with no retry.
- `proxy.ts` handles routing between ariesai.in and libraai.in based on the request hostname — this is the backbone of dual-brand support
- The Settings page sends ALL settings in one PATCH call (not per-field) — the API filters via allowedFields whitelist
- Templates page has NO local DB table — templates are fetched directly from Gupshup API on each page load (no caching, no stale data, but slower)
- The AI persona (sales_pro, etc.) changes the system prompt, not the model
- Follow-up messages (30min, 3hr, 24hr, 7day) are scheduled via BullMQ delayed jobs — if the worker isn't running, they silently never fire
- `src/lib/tenant/manager.ts` caches tenant config in a JS Map with TTL — `invalidateCache(tenantId)` clears it after settings update
- The "Test Connection" API endpoint still exists (`/api/dashboard/settings/test-gupshup`) but is no longer called from UI — useful for admin curl testing
- Toast inconsistency: Settings page uses `sonner`, Broadcast page uses `react-hot-toast` — both work but look slightly different
- The flow engine processes nodes synchronously in sequence — no parallel execution of branches
- Google Sheets sync is OAuth-based (proper flow), NOT webhook-based like some competitors
- Cold emails sent from `founder@ariesai.in` via Zoho Mail — separate from the product's email system (Resend)

---

# 10. ROADMAP

### Immediate (before first client)
Remove auth bypass, run migrations, deploy worker, set env vars, manual onboard first client

### Short term (first 5 clients)
Apply for Gupshup Partner Program, add webhook signature verification, standardize toasts, fix any live bugs

### Medium term (10-50 clients)
Self-serve embedded signup, billing enforcement, audience segmentation for broadcasts, provider abstraction layer, team roles/permissions

### Long term (50+ clients)
Instagram automation (Libra), WhatsApp Commerce, multi-language AI, white-label for agencies, API for enterprise

---

# 11. DEEP IMPLEMENTATION DETAILS — THE REAL CODE

## Auth System — How `getTenantId()` Actually Works

File: `src/lib/auth/getTenantId.ts`

**The dev bypass (`return 'test-tenant-123'`) has already been removed.** The function is production-ready.

Actual flow:
1. Wrapped in React `cache()` — deduplicates within a single server request lifecycle (so if 3 API helpers call `getTenantId()` in the same render, only 1 auth call happens)
2. Gets the cookie store via `await cookies()` (Next.js 16 async API)
3. Creates a Supabase SSR client with cookie read/write wrappers
4. Tries `supabase.auth.getUser()` first (validates JWT server-side against Supabase)
5. Falls back to `supabase.auth.getSession()` (local JWT decode, no network call) if `getUser()` throws (network timeout)
6. Gets `userId` from auth
7. Looks up `users` table (NOT `tenants`) with `supabaseAdmin.from('users').select('tenant_id').eq('auth_id', userId).single()`
8. Returns `tenant_id` from the users row

**Critical hidden detail:** There's a `users` table separate from `tenants`. The `users` table maps Supabase Auth users to tenants. Schema: `{ id, tenant_id, auth_id, email, full_name, avatar_url, role, is_platform_admin, last_login_at, created_at, updated_at }`.

**User roles:** `owner | admin | staff | viewer` — but role-based access control is NOT enforced anywhere in the API routes. Every authenticated user for a tenant has the same access. The roles exist in the type system and DB but have no middleware checking them.

## Middleware — How Auth Actually Protects Routes

File: `/middleware.ts` (root level, NOT in src/)

1. **Brand detection:** Reads hostname → `detectBrandFromHost(host)` → sets `x-brand` header. If host contains "libra", brand = "libra". Otherwise "aries".
2. **Libra root rewrite:** If brand is "libra" and path is "/", rewrites to "/libra" internally (serves different landing page).
3. **Supabase not configured guard:** If `NEXT_PUBLIC_SUPABASE_URL` is missing or equals `'https://your-project.supabase.co'`, allows all access. This is a dev escape hatch.
4. **Auth check:** Uses `getSession()` (NOT `getUser()`) in middleware. Comment explains: `getUser()` caused infinite redirect loops when slow.
5. **Cookie hardening:** Every auth cookie gets `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`. This is a security measure — prevents JS access to session JWTs.
6. **Redirect on unauthenticated:** `/dashboard/*` and `/admin/*` → redirect to `/login?redirect={path}`
7. **Redirect on already authenticated:** `/login` and `/signup` → redirect to `/dashboard`
8. **Admin routes:** No permission check in middleware. Comment: "The admin page itself handles this via API." Only checks they're authenticated.

**Matcher config:**
```
'/', '/dashboard/:path*', '/admin/:path*', '/login', '/signup', '/api/dashboard/:path*', '/api/webhooks/:path*'
```

**Hidden edge case:** Webhook routes (`/api/webhooks/*`) are in the matcher but aren't protected (no redirect). The middleware runs on them for cookie refresh but webhooks are public by design.

## Supabase Admin Client — The Lazy Proxy Pattern

File: `src/lib/supabase/admin.ts`

```typescript
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') return value.bind(client);
    return value;
  },
});
```

**Why this matters:** The Proxy ensures `supabaseAdmin` is a module-level export (so you can import it normally) but the actual Supabase client isn't created until the first property access at runtime. This prevents build failures when env vars aren't available at build time. If you replace this with `const supabaseAdmin = createClient(...)`, the build will fail on Vercel because env vars aren't available during `next build`.

**Hidden detail:** It checks `process.env.SUPABASE_POOLER_URL` FIRST, then falls back to `NEXT_PUBLIC_SUPABASE_URL`. The pooler URL is for PgBouncer connection pooling (recommended for serverless).

## Encryption — How AES-256-GCM Works in This Project

File: `src/lib/utils/crypto.ts`

Format: `enc:v1:{iv_hex}:{auth_tag_hex}:{encrypted_hex}`

- Key: SHA-256 hash of `ENCRYPTION_KEY` env var (min 16 chars required)
- IV: 12 random bytes per encryption (unique per value)
- Auth tag: GCM authentication tag for tamper detection
- **Idempotent:** `encryptToken()` checks for `enc:v1:` prefix. If present, returns as-is (no double encryption).
- **Backwards compatible:** `decryptToken()` checks for `enc:v1:` prefix. If absent, returns value as-is (treats as legacy plaintext).
- **Hard fail:** If `ENCRYPTION_KEY` is missing or < 16 chars, throws immediately. Comment: "This prevents silent data corruption where decryptToken returns garbage and that garbage gets sent to Meta's API causing silent 401s."
- **Graceful degrade:** If decryption fails (wrong key), catches the error, logs it, and returns the encrypted string as-is rather than crashing.

**If you lose ENCRYPTION_KEY:** All encrypted API keys, OAuth tokens, and passwords stored in the DB become unrecoverable. There is no key rotation mechanism built.

## Redis Client — IT'S A STUB (Critical to Know)

File: `src/lib/redis/client.ts`

**`getRedisClient()` ALWAYS returns `null`.** Redis is completely disabled in the Vercel deployment. The comment says: "The worker service (separate repo/container) handles BullMQ + Redis."

Implications:
- **No Redis caching** — `cacheGet()` always returns null, `cacheSet()` is a no-op
- **No Redis rate limiting** — `checkRedisRateLimit()` always returns `{ allowed: true }`
- **No Redis message dedup** — `isDuplicateMessage()` falls back to a direct DB query (`SELECT id FROM messages WHERE wa_message_id = ?`)
- **Tenant config caching** (`manager.ts`) calls `cacheGet/cacheSet` which are no-ops, so tenant config is fetched from DB on every request (within the same serverless invocation, `cache()` in getTenantId prevents duplicate auth, but tenant config is NOT cached across invocations)
- **Broadcast reply tracking** (`webhook handler`) tries `redis.get(broadcastKey)` but redis is null, so broadcast reply counting silently doesn't work
- **Follow-up scheduling** doesn't work without Redis+BullMQ worker running

**The tenant manager (`manager.ts`) has a sophisticated caching system with Redis TTL, stampede protection (distributed locking), and in-flight promise deduplication — but NONE OF IT WORKS because Redis returns null.** All that code is dead until Redis is actually connected.

## Webhook Handler — Full Async Processing Pipeline

File: `src/app/api/webhooks/gupshup/route.ts` (636 lines, the heart of the system)

### Webhook Security
- Optional shared-secret verification: `GUPSHUP_WEBHOOK_SECRET` env var
- If set, webhook URL must be `https://ariesai.in/api/webhooks/gupshup?token={secret}`
- Also checks `x-gupshup-token` header as alternative
- If token doesn't match, returns 200 (accepts silently to prevent Gupshup retries) but discards payload
- **If env var is NOT set, ALL webhook requests are accepted.** No verification.

### Body Parsing (Hidden Complexity)
Gupshup sends webhooks in multiple formats depending on version:
1. `application/json` — standard JSON
2. `application/x-www-form-urlencoded` — form-encoded with JSON values nested as strings
3. Unknown content-type — tries JSON first, then form-encoded as fallback
4. Each form field is tried as `JSON.parse(value)` to handle nested JSON strings

### Fire-and-Forget Pattern
Uses Next.js 16's `after()` API to process the message AFTER the HTTP 200 response is sent to Gupshup. This guarantees < 5s response time. If the processing fails, the error is logged but Gupshup never retries (because it already got 200).

### Tenant Lookup (Dual Strategy)
1. Primary: `SELECT * FROM tenants WHERE gupshup_app_name = ? AND is_active = true`
2. Fallback: `SELECT * FROM tenants WHERE gupshup_phone_number = ? AND is_active = true`
3. If neither matches, message is silently dropped with an error log

### Message Dedup (Three Layers)
1. Redis SET NX (disabled — Redis returns null)
2. DB query: `SELECT id FROM messages WHERE wa_message_id = ?`
3. DB upsert: `INSERT ... ON CONFLICT (wa_message_id) DO NOTHING` — if duplicate slips through the above checks, the DB-level unique constraint catches it

### Lead Creation Logic
- Cleans phone: strips all non-digits
- Checks if lead exists by `(tenant_id, phone)`
- If new lead:
  - Round-robin assignment: fetches all team members (`users` table), uses `lead_assignment_counter` modulo team size
  - Counter increment is fire-and-forget (`void supabaseAdmin.from('tenants').update(...)`)
  - Lead score: 30 for CTWA ad leads, 10 for organic
  - Source: 'meta_ctwa' for ad leads, 'whatsapp' for organic
  - For CTWA leads, stores ad headline, ad ID, and click ID in notes field
  - Fires `new_lead` integration event (non-blocking)
  - Appends to Google Sheets (non-blocking, silently fails if not connected)

### Broadcast Reply Tracking
When a message arrives, checks Redis for `broadcast:phone:{tenantId}:{phone}`. If found, means this person was recently sent a broadcast → increments `replied_count` on the campaign. **This currently doesn't work because Redis is disabled.**

### AI Processing Pipeline
1. Check if bot is paused (`conversation.bot_paused`) or escalated (`conversation.escalated`) → skip AI
2. Check AI conversation limit (`ai_conversations_this_month >= ai_conversation_limit`) → skip AI if over limit
3. Run flow engine first (`runFlowsForMessage`) → if flow handles it, skip AI entirely
4. Load in parallel: smart_rules, agent_configs, RAG docs (with fallback to raw knowledge_docs)
5. Multi-agent routing: find agent whose `routing_keywords` match the message text
6. Build tenant config with agent overrides (agent's bot_name/personality replaces defaults)
7. Call Gemini 2.0 Flash via `processMessageWithAI()`
8. If AI response includes `requestPayment: 'true'` → create Razorpay payment link → append to reply
9. Send reply via Gupshup
10. Save outbound message to DB
11. Update conversation context, step, escalation status
12. Update lead score based on AI-detected intent

### Intent-to-Score Mapping
```
human_request: 60, complaint: 30, reserve_table: 80, private_event: 85,
corporate_booking: 90, confirm: 95, cancel: 20, pricing: 65,
general_enquiry: 40, greeting: 20, unknown: 10
```
Score ≥ 80 = hot, ≥ 50 = warm, < 50 = cold

### Status Update Handler
Maps Gupshup status strings to internal statuses:
- `sent` → `sent`, `delivered` → `delivered`, `read` → `read`, `failed` → `failed`
- `enqueued` → `sent`, `processing` → `sent` (Gupshup internal states mapped to "sent")
- Updates `messages` table by `wa_message_id`

## AI Engine — System Prompt Architecture

File: `src/lib/ai/engine.ts`

### Gemini API Usage
- Model: `gemini-2.0-flash`
- Lazy init: `_ai` variable, initialized on first call with `process.env.GEMINI_API_KEY`
- Temperature: 0.7 (balanced creativity/consistency)
- Max output tokens: 500
- Response MIME type: `application/json` (forces structured JSON output)
- Timeout: 15 seconds hard circuit breaker via `withTimeout()`
- Token tracking: After each call, calls `supabaseAdmin.rpc('increment_ai_tokens', { t_id, token_count })`

### System Prompt Contents
The AI receives:
1. Bot name and personality
2. Full business info (name, type, phone, address, website, USPs, current offer)
3. Custom FAQs (injected directly as Q&A pairs)
4. Conversation state flag: "FIRST message" vs "ONGOING conversation"
5. Smart rules (active automation rules with AI summaries)
6. Knowledge base documents (RAG results or raw doc text)
7. Strict JSON output format specification
8. Rules: never make up info, never re-greet, keep under 300 chars, respond in customer's language

### Conversation History
- Fetches last 10 messages from DB
- Reverses (oldest first), excludes the current message
- Maps to `{ role: 'user'|'model', parts: [{ text }] }` format for Gemini

### Fallback Response (When Gemini Fails)
- Keyword matching for angry/escalation words → escalate
- Keyword matching for booking intent → structured booking flow
- Keyword matching for event intent → event flow
- Keyword matching for pricing → pricing template
- Default: welcome message with options menu
- **The fallback responses are hard-coded with restaurant-specific language** ("Reserve a Table", "₹1,500-₹3,500/person"). This works for restaurants but is wrong for dentists, lawyers, etc. This is TECH DEBT.

### Follow-up Message Generation
- `generateFollowUpMessage()` — uses Gemini to write personalized follow-ups
- Has hardcoded fallback templates for 30min/3hr/24hr/7day intervals
- Called by the BullMQ worker (which isn't deployed yet)

## Tenant Manager — More Than Simple CRUD

File: `src/lib/tenant/manager.ts` (362 lines)

### Lookup Functions
1. `getTenantById(tenantId)` — used by most API routes
2. `getTenantByPhoneNumberId(phoneNumberId)` — used by webhook for Meta direct integration (legacy)
3. `getTenantByIgPageId(igPageId)` — used by Instagram webhook
4. `getTenantByShopifyUrl(storeUrl)` — used by Shopify webhook

### Cache Architecture (Inactive Without Redis)
- Redis-backed with 5-min TTL
- Cross-indexes: when a tenant is cached by ID, also caches by phone and IG page
- Stampede protection on phone lookup: Redis distributed lock (`SET key 1 EX 5 NX`)
- In-flight promise dedup: `inFlightPromises` Map prevents concurrent identical lookups

### Usage Tracking
- `incrementMessageCount(tenantId)`:
  - With Redis: increments `usage:msg:{tenantId}:{YYYY-MM}` key, syncs to DB every 10th message
  - Without Redis: calls `supabaseAdmin.rpc('increment_message_count', { t_id })` every time
  - The DB RPC function `increment_message_count` must exist in Supabase

- `checkUsageLimits(tenant)`:
  - Compares `messages_used_this_month` vs `message_limit`
  - Compares `ai_conversations_this_month` vs `ai_conversation_limit`
  - Returns `{ withinLimits, messagesRemaining, usagePercent }`

### `getTenantConfig(tenant)` — What the AI Engine Receives
Extracts clean config from raw tenant row:
- Business info, bot personality, working hours
- Hot/warm keywords for lead scoring
- Custom FAQs (Fix #7 — comment says this was a bug fix)
- Off-hours config (Fix #8 — another bug fix)

### Tenant Type — Full Schema

The `Tenant` interface has fields nobody would guess exist:
- `wa_phone_number_id` — Meta Cloud API phone number ID (legacy, pre-Gupshup)
- `wa_access_token` — Meta Cloud API token (legacy)
- `wa_app_secret` — Meta app secret (legacy)
- `wa_verify_token` — webhook verification token
- `wa_webhook_verified` — boolean flag
- `wa_token_expired` — boolean flag
- `ig_access_token` / `ig_page_id` — Instagram integration
- `shopify_store_url` / `shopify_access_token` / `shopify_webhook_secret` — Shopify integration
- `plan` — starter | growth | pro | enterprise
- `plan_status` — trialing | active | past_due | cancelled | suspended
- `razorpay_customer_id` / `razorpay_subscription_id` — billing IDs
- `trial_ends_at` — trial expiration
- `messages_used_this_month` / `ai_conversations_this_month` — usage counters
- `message_limit` / `ai_conversation_limit` — plan limits
- `current_billing_period_start` — billing period tracking
- `is_active` — tenant active flag (checked in all lookups)
- `onboarding_completed` — boolean
- `logo_url` — tenant logo

### Plan Pricing (In Code vs Marketing)
```
PLAN_DETAILS in types/index.ts:
  starter:    ₹2,499/mo  1,000 messages
  growth:     ₹4,999/mo  5,000 messages
  pro:        ₹9,999/mo  unlimited (999,999)
  enterprise: custom     unlimited
```
**This differs from the marketing site pricing (₹999/₹2,499/₹6,999).** The code has higher prices. Either the marketing site is outdated or the code needs updating. This is a DISCREPANCY.

## Integration Runner — Event-Driven Multi-Service Hub

File: `src/lib/integrations/runner.ts`

Supported integrations (with actual handler code):
1. **Razorpay** — creates payment links for `payment_requested` events
2. **Google Sheets** — POSTs new lead data to a webhook URL
3. **Zoho CRM** — creates leads via Zoho API with OAuth token
4. **Shiprocket** — authenticates and logs booking events (tracking not yet implemented)
5. **Pabbly Connect** — generic webhook POST for any event type
6. **Custom Webhooks** — generic webhook POST

Each integration reads config from `tenant_integrations` table: `{ integration_id, config (JSONB), is_active }`.

**Hidden detail:** The Google Sheets integration in runner.ts uses a webhook URL (Zapier-style), but there's ALSO a separate OAuth-based Google Sheets sync (`src/lib/integrations/google-sheets.ts` imported in webhook handler). These are two different systems for the same purpose.

## Brand System — Aries vs Libra

File: `src/lib/brand.ts`

```
Aries: domain=ariesai.in, channel=whatsapp, color=#25D366 (WhatsApp green)
Libra: domain=libraai.in, channel=instagram, color=#E1306C (Instagram pink)
```

Detection: `host.toLowerCase().includes('libra')` → "libra", else "aries". This means localhost defaults to Aries.

## Safety Utilities — Crash Prevention

File: `src/lib/utils/safety.ts`

- `safeAsync(fn, context, fallback)` — try/catch wrapper with logging
- `withRetry(fn, { maxRetries, delayMs, backoff })` — exponential backoff retry
- `withTimeout(fn, timeoutMs, fallback)` — Promise.race with timeout
- `checkRateLimit(key, maxRequests, windowMs)` — in-memory rate limiter (per serverless invocation only, resets on cold start)
- `sanitizeInput(input, maxLength)` — strips HTML/script tags
- `isValidPhone(phone)` — 10-15 digit check
- `isValidEmail(email)` — basic regex

**The in-memory rate limiter** has a cleanup interval that runs every 60 seconds. It calls `cleanup.unref()` so it doesn't prevent Node from exiting. On Vercel serverless, this rate limiter is useless — each invocation is a separate process with a fresh empty Map.

## Sentry — It's a Stub

File: `src/lib/sentry-stub.ts`

`captureException()` just calls `console.error()`. Sentry is NOT actually configured. The stub exists so the codebase can import `@/lib/sentry-stub` without failing.

## Broadcast Send — The Fire-and-Forget Trap

File: `src/app/api/broadcasts/send/route.ts`

The `after()` callback in broadcast send has NO timeout protection. If sending 500 messages at 200ms each = 100 seconds. Vercel functions have a max duration (typically 5-10 minutes on pro). If the function is killed mid-send:
- Some messages are sent, some are not
- `broadcast_messages` rows exist for sent ones
- Campaign status stays as "sending" forever (no cleanup)
- There is NO resume mechanism
- The user would need to create a new campaign to reach unsent recipients

## Conversation Object — Hidden Fields

```typescript
interface Conversation {
  current_step: string;     // AI-managed: greeting, ask_intent, ask_guests, ask_date, etc.
  flow_type: string | null; // Which flow is active
  context: ConversationContext;  // JSON blob of extracted data
  bot_paused: boolean;      // Human took over — AI won't reply
  escalated: boolean;       // Marked for human attention
  escalated_at: string;     // When escalation happened
  escalation_reason: string; // Why (complaint, human_request, etc.)
  ai_model_used: string;    // 'gemini-2.0-flash'
  ai_tokens_used: number;   // Running token count
  message_count: number;    // Incremented via RPC
}
```

`ConversationContext` can hold restaurant-specific fields (guest_count, date_requested, occasion) AND generic fields (`[key: string]: unknown`). The AI extracts these progressively across messages.

## DB RPCs (Stored Procedures) That Must Exist

The code calls these Supabase RPCs that must be created in the database:
1. `increment_message_count` — `(t_id uuid)` — increments tenant monthly message count
2. `increment_message_count_conv` — `(conv_id uuid)` — increments conversation message count
3. `increment_ai_tokens` — `(t_id uuid, token_count integer)` — adds to AI token usage
4. `set_message_count` — `(t_id uuid, count integer)` — sets exact count (used by Redis sync)
5. `match_knowledge_docs` — `(query_embedding vector, match_count integer, tenant_id uuid)` — pgvector similarity search

If these RPCs don't exist, the code catches the error and continues (non-fatal), but usage tracking and message counts will be wrong.

## Tables Not Previously Documented

From the code, these additional tables are used:
- `users` — Dashboard users (maps auth_id → tenant_id, has roles)
- `smart_rules` — Active automation rules with AI summaries (name, trigger_source, ai_summary, status)
- `agent_configs` — Multi-agent routing configs
- `tenant_integrations` — Per-tenant integration configs (integration_id, config JSONB, is_active)
- `knowledge_docs` — Uploaded knowledge base documents (filename, content_text, embedding vector)
- `bookings` — Appointment bookings
- `shopify_events` — Shopify webhook events
- `analytics_events` — Generic analytics tracking

---

# 12. EDGE CASES & RACE CONDITIONS

1. **Duplicate webhook delivery:** Gupshup may retry webhooks. The dedup chain is: Redis check (disabled) → DB query → DB upsert ON CONFLICT. The DB upsert is the real guard. There's a race window between the DB query and the upsert where two concurrent invocations could both pass the check and try to insert — the ON CONFLICT handles this.

2. **Lead assignment counter race:** `void supabaseAdmin.from('tenants').update({ lead_assignment_counter: counter + 1 })` is fire-and-forget and NOT atomic. Two concurrent webhook invocations could read the same counter value and assign to the same team member. This is a minor issue — leads still get assigned, just not perfectly round-robin.

3. **Conversation resolution:** `SELECT * FROM conversations WHERE sender_id = ? AND is_active = true ORDER BY created_at DESC LIMIT 1` — if there are multiple active conversations from the same phone (shouldn't happen but could from bugs), the most recent one is used.

4. **AI timeout vs fallback:** The 15-second timeout on Gemini calls means the fallback (hardcoded restaurant messages) triggers if Google is slow. The fallback is restaurant-specific — for non-restaurant businesses, the fallback will give irrelevant responses (table booking prompts for a dentist).

5. **Media message text extraction:** For non-text messages (image, video, audio, file), the `text` field is set to the caption if present, otherwise `[image]`, `[video]`, etc. This means the AI sees `[image]` as the "message" and will try to respond to it.

6. **Status update phone mapping:** Status updates use `payload.destination` OR `payload.source` as the phone. The inconsistency depends on Gupshup's webhook version. This could cause status updates to not match any message if the phone field varies.

7. **Outbound webhook race:** The outbound webhook (Zapier/Make) fires before AI processing completes. The external system gets the raw inbound message but not the AI response. If the external system also tries to reply, you get duplicate responses.

---

# 13. FRAGILE AREAS — DO NOT TOUCH WITHOUT UNDERSTANDING

1. **`middleware.ts`** — Cookie hardening logic. The `setAll` callback recreates the response object. Changing this can break auth (infinite redirect loops, lost sessions). Comment says previous bugs existed from recreating `response` inside loops.

2. **`src/lib/supabase/admin.ts`** — The Proxy pattern. If you replace with eager init, builds break.

3. **`src/lib/utils/crypto.ts`** — AES-256-GCM. Changing the algorithm, prefix format, or key derivation breaks all stored encrypted tokens permanently.

4. **`src/lib/brand.ts`** — Simple but critical. The `detectBrandFromHost()` function drives all dual-brand routing. Breaking this serves wrong landing pages.

5. **Webhook handler's `after()` pattern** — If you move processing out of `after()`, Gupshup will timeout (> 5s) and retry, causing duplicate messages.

6. **`parseGupshupWebhook()`** — Gupshup v2 nests payloads differently from v1. The `payload.payload.text` path handles v2 format. Simplifying the nesting logic will break message parsing.

---

# 14. PRICING DISCREPANCY

Marketing site says: Starter ₹999 | Growth ₹2,499 | Pro ₹6,999
Code PLAN_DETAILS says: Starter ₹2,499 | Growth ₹4,999 | Pro ₹9,999
Cold email memory says: US pricing $149/$249

These need to be reconciled before billing goes live.

---

# 15. WHAT BREAKS IF SPECIFIC ENV VARS ARE MISSING

| Missing Var | Impact |
|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Build succeeds but ALL auth + data fails. Middleware allows all access (dev mode). |
| `SUPABASE_SERVICE_ROLE_KEY` | Throws at runtime on first DB access. Nothing works. |
| `GEMINI_API_KEY` | AI engine throws → fallback responses only (restaurant-specific). |
| `ENCRYPTION_KEY` | Hard crash on any encrypt/decrypt call. All API key operations fail. |
| `GUPSHUP_WEBHOOK_SECRET` | Webhook accepts all payloads (no verification). Security risk. |
| `RAZORPAY_KEY_ID/SECRET` | Payment link creation silently fails. |
| `RESEND_API_KEY` | Email sending fails. |
| `SENTRY_DSN` | Sentry is already a stub. No impact. |

---

# 16. COMPLETE EXECUTION TRACE — First Client Message

1. Customer sends "Hi" to +919876543210 on WhatsApp
2. WhatsApp → Meta servers → Gupshup platform
3. Gupshup POSTs to `https://ariesai.in/api/webhooks/gupshup?token=xyz`
4. Vercel cold-starts the function (100-500ms)
5. Middleware runs: detects brand "aries", refreshes session cookies (but webhook has no session — just passes through)
6. Webhook handler parses body (JSON or form-encoded)
7. Validates `GUPSHUP_WEBHOOK_SECRET` token
8. `parseGupshupWebhook(body)` extracts: messageId, fromPhone, appName, text="Hi"
9. Returns `{ ok: true }` to Gupshup (< 5 seconds)
10. `after()` callback fires:
11. `isDuplicateMessage(messageId)` → queries DB → not found → proceed
12. Tenant lookup by `gupshup_app_name` → finds tenant row
13. Lead lookup by `(tenant_id, phone)` → not found → create new lead
    - Round-robin: fetch team members, get counter, assign
    - Score: 10 (organic), Status: new, Source: whatsapp
    - Fire `new_lead` integration event
    - Append to Google Sheets
14. Conversation lookup by `(tenant_id, sender_id, is_active)` → not found → create
    - current_step: 'greeting', bot_paused: false, ai_model_used: 'gemini-2.0-flash'
15. Upsert inbound message to `messages` table (ON CONFLICT wa_message_id)
16. Increment conversation message count via RPC
17. Fire outbound webhook to tenant's configured URL (if any)
18. Check bot_paused / escalated → false → proceed
19. Check AI limits → within limits → proceed
20. Run flow engine → no matching flows → proceed to AI
21. Load smart_rules, agent_configs, RAG docs in parallel
22. Build tenant config (business name, FAQs, personality, etc.)
23. Call `processMessageWithAI("Hi", [], {}, tenantConfig, tenantId)`
24. Build system prompt with all context
25. Call Gemini 2.0 Flash: `responseMimeType: 'application/json'`
26. Gemini returns JSON: `{ "reply": "Hi! Welcome to... 👋", "intent": "greeting", ... }`
27. Parse response → extract data → merge into conversation context
28. Send reply via `sendTextMessage()` → Gupshup API → Meta → Customer's WhatsApp
29. Save outbound message to DB (status: 'sent', ai_generated: true)
30. Update conversation: context, current_step='ask_intent', escalated=false
31. Update lead: score=20 (greeting intent), status=cold
32. Later: Gupshup sends status webhook (delivered → read) → updates message status in DB
