# MASTER PROMPT — Aries AI Platform (Complete Context for Claude)

> Paste this entire document to Claude before any development task.
> Last updated: May 2026

---

## 1. WHAT THIS PROJECT IS

**Aries AI** is a production multi-tenant SaaS platform that puts an AI-powered WhatsApp chatbot in front of Indian businesses. A business signs up, connects their WhatsApp number (via Gupshup BSP), configures an AI persona, and the bot auto-replies to customer messages, qualifies leads, books tables/events, sends follow-ups, and escalates to human agents when needed.

A **second brand**, **Libra AI**, lives in the same codebase targeting Instagram DM automation. Both brands share the same database, auth, and API layer — separated only by `x-brand` header routing in middleware.

**Live URLs:**
- Dashboard / API: `https://aries-ai-landing.vercel.app` (Vercel, also aliased to `https://ariesai.in`)
- GitHub repo: `Sakshay28/aries-ai-landing`
- Supabase project: connected via `NEXT_PUBLIC_SUPABASE_URL`

---

## 2. TECH STACK (exact versions)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js App Router | ^16.2.6 |
| React | React 19 | 19.2.4 |
| Database | Supabase (PostgreSQL + RLS) | @supabase/supabase-js ^2.103.3 |
| AI | Google Gemini 2.0 Flash | @google/genai ^1.50.1 |
| WhatsApp BSP | Gupshup v2 (NOT Meta Cloud API direct) | custom |
| Instagram | Meta Graph API via direct token | custom |
| Payments | Razorpay Subscriptions | razorpay ^2.9.6 |
| Job Queue | BullMQ + Upstash Redis | via worker.ts |
| Styling | TailwindCSS v4 + shadcn/ui components | tailwindcss ^4 |
| Icons | Lucide React | ^1.14.0 |
| Animation | Framer Motion | ^12.38.0 |
| Flow Builder | @xyflow/react (ReactFlow) | ^12.10.2 |
| State | Zustand + Zundo (undo/redo) | ^5.0.13 |
| Charts | Recharts + ApexCharts | latest |
| Email | Resend | ^6.12.2 |
| Encryption | Node.js Crypto (AES-256-GCM) | built-in |
| Testing | Vitest | ^4.1.5 |
| Deployment | Vercel (Next.js) + Render/Railway (worker) | — |

---

## 3. REPOSITORY STRUCTURE

```
/
├── middleware.ts              # Auth guard + brand detection (Aries/Libra)
├── worker.ts                  # Standalone BullMQ worker (NOT in Next.js)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Aries AI landing page (very large, ~870 lines)
│   │   ├── libra/             # Libra AI landing page
│   │   ├── login/             # Login page
│   │   ├── signup/            # Signup page
│   │   ├── onboard/           # Post-signup onboarding wizard
│   │   ├── dashboard/         # Main SaaS dashboard (all authenticated pages)
│   │   │   ├── _layout/       # AppSidebar, Header, etc.
│   │   │   ├── _sections/     # Dashboard widgets (RecentChats, Stats, etc.)
│   │   │   ├── chat/          # Live chat inbox (ChatSidebar, ChatArea, CRMPanel)
│   │   │   ├── leads/         # Lead management
│   │   │   ├── contacts/      # Contact list
│   │   │   ├── broadcast/     # Broadcast campaigns
│   │   │   ├── flows/         # Visual flow builder (ReactFlow)
│   │   │   ├── agents/        # AI agent configuration
│   │   │   ├── analytics/     # Analytics dashboard
│   │   │   ├── templates/     # WhatsApp message templates
│   │   │   ├── knowledge/     # Knowledge base (RAG docs)
│   │   │   ├── integrations/  # Google Sheets, Calendar, Shopify
│   │   │   ├── automations/   # Smart rules / triggers
│   │   │   ├── settings/      # Business profile, bot config
│   │   │   ├── billing/       # Plans and subscription
│   │   │   └── team/          # Team member management
│   │   └── api/
│   │       ├── webhooks/
│   │       │   ├── gupshup/   # WhatsApp inbound + status updates
│   │       │   └── instagram/ # Instagram DM webhook
│   │       ├── chat/
│   │       │   ├── send/      # Agent sends message from dashboard
│   │       │   └── statuses/  # Poll message delivery statuses
│   │       ├── broadcasts/    # Trigger bulk WhatsApp campaigns
│   │       ├── dashboard/     # Data APIs (conversations, stats, leads, etc.)
│   │       │   ├── chat/
│   │       │   │   ├── conversation/   # Fetch single conversation + messages
│   │       │   │   └── conversations/ # List all conversations
│   │       │   └── conversations/     # Recent chats for dashboard home
│   │       ├── auth/          # signup, login helpers
│   │       ├── onboard/       # Onboarding save API
│   │       ├── integrations/  # Google OAuth, Shopify
│   │       └── health/        # Health check endpoint
│   ├── lib/
│   │   ├── types/index.ts     # ALL TypeScript types (source of truth)
│   │   ├── brand.ts           # Aries/Libra brand config + host detection
│   │   ├── supabase/
│   │   │   ├── admin.ts       # supabaseAdmin (service role, lazy proxy)
│   │   │   ├── client.ts      # createBrowserSupabaseClient
│   │   │   └── server.ts      # createServerSupabaseClient
│   │   ├── ai/
│   │   │   ├── engine.ts      # Gemini 2.0 Flash AI conversation engine
│   │   │   ├── rag.ts         # RAG pipeline (pgvector embeddings)
│   │   │   └── prompts.ts     # System prompt builders
│   │   ├── gupshup/
│   │   │   └── service.ts     # sendTextMessage, parseGupshupWebhook, etc.
│   │   ├── instagram/
│   │   │   └── service.ts     # sendInstagramMessage, parseInstagramWebhook
│   │   ├── tenant/
│   │   │   └── manager.ts     # getTenantConfig, checkUsageLimits, incrementMessageCount
│   │   ├── flows/
│   │   │   └── engine.ts      # Flow execution engine (runs visual flows)
│   │   ├── followup/
│   │   │   └── engine.ts      # BullMQ follow-up scheduler
│   │   ├── broadcast/         # Broadcast queue logic
│   │   ├── payments/
│   │   │   └── razorpay-links.ts  # Payment link creation
│   │   ├── integrations/
│   │   │   ├── google-sheets.ts
│   │   │   ├── google-calendar.ts
│   │   │   └── runner.ts      # Integration dispatcher
│   │   ├── auth/
│   │   │   └── getTenantId.ts # Server-side tenant resolution from session
│   │   ├── redis/
│   │   │   └── client.ts      # Upstash Redis + isDuplicateMessage + rate limiter
│   │   ├── utils/
│   │   │   ├── crypto.ts      # encryptToken / decryptToken (AES-256-GCM)
│   │   │   ├── logger.ts      # Structured JSON logging
│   │   │   └── safety.ts      # withTimeout, retry helpers
│   │   └── database/
│   │       ├── schema.sql     # Full Supabase schema + RLS + indexes
│   │       └── migrations/    # Incremental migration SQL files
│   └── components/
│       └── ui/                # shadcn/ui base components
```

---

## 4. DATABASE SCHEMA (all tables)

All tables have `tenant_id UUID` + RLS enforcing strict tenant isolation.

### Core Tables

**`tenants`** — One row per business client
- Bot config: `bot_name`, `bot_personality`, `welcome_message`, `welcome_offer`, `usps[]`, `working_hours`, `custom_faqs`, `off_hours_message`
- WhatsApp (Gupshup): `gupshup_api_key` (AES-256 encrypted), `gupshup_phone_number`, `gupshup_app_name`
- Instagram: `ig_access_token` (encrypted), `ig_page_id`
- Billing: `plan` (starter/growth/pro/enterprise), `plan_status` (trialing/active/past_due/cancelled), `razorpay_customer_id`, `razorpay_subscription_id`, `trial_ends_at`, `messages_used_this_month`, `message_limit`
- Staff: `staff_phone`, `staff_name`, `manager_phone`
- Follow-up flags: `followup_30min`, `followup_3hr`, `followup_24hr`, `followup_7day`

**`users`** — Dashboard login users
- `tenant_id`, `auth_id` (Supabase Auth UUID), `email`, `full_name`, `role` (owner/admin/staff/viewer), `is_platform_admin`

**`leads`** — Customer contacts
- `name`, `phone`, `email`, `channel` (whatsapp/instagram_dm/etc.), `lead_status` (new/hot/warm/cold/converted/lost), `lead_score` (0-100), `source` (organic/ctwa_ad), `assigned_to` (user UUID)
- CTWA (Click-to-WhatsApp) leads have `source = 'ctwa_ad'`

**`conversations`** — Active chat sessions
- `sender_id` (customer phone), `sender_name`, `channel`, `context` (JSONB conversation state), `is_active`, `bot_paused` (human takeover), `escalated`, `current_step`

**`messages`** — Individual messages
- `direction` (inbound/outbound), `content`, `message_type`, `wa_message_id` (Gupshup msg ID for status tracking), `status` (pending/sent/delivered/read/failed), `ai_generated`, `channel`

**`follow_ups`** — Scheduled follow-up messages
- `follow_up_type` (30min/3hr/24hr/7day), `status` (pending/sent/cancelled/failed), managed by BullMQ worker

**`broadcast_campaigns`** — Bulk message campaigns
- `name`, `message`, `recipient_count`, `sent_count`, `delivered_count`, `replied_count`, `status` (draft/running/completed/failed)

**`smart_rules`** — Automation triggers
- `trigger_source`, `condition`, `action`, `ai_summary`, `status` (active/inactive)

**`agent_configs`** — AI agent persona settings per tenant
- `agent_name`, `routing_keywords[]`, `bot_name`, `bot_personality`, `system_prompt`

**`knowledge_docs`** — RAG knowledge base
- `title`, `content`, `embedding` (vector, 768-dim), `tenant_id`

**`business_profiles`** — Extended business info

**`tenant_integrations`** — OAuth tokens for Google/Shopify integrations

### Recent Migrations (applied)
- `2026_05_05_brand_split.sql` — Aries/Libra brand split
- `2026_05_18_gupshup_columns.sql` — Added gupshup_* columns to tenants
- `2026_05_18_smart_rules.sql` — smart_rules table
- `2026_05_18_automation_flows.sql` — automation_flows table
- `2026_05_18_agent_configs.sql` — agent_configs table (RLS uses `users.tenant_id`)
- `2026_05_18_knowledge_base.sql` — knowledge_docs table
- `2026_05_18_rag_pipeline.sql` — pgvector extension + embedding column
- `2026_05_18_business_profiles.sql` — business_profiles table
- `2026_05_18_broadcast_replied.sql` — replied_count on broadcast_campaigns
- `2026_05_19_lead_assignment.sql` — assigned_to on leads, lead_assignment_counter on tenants
- `2026_05_18_fix_rls_recursion.sql` — Fixed infinite RLS recursion on tenants table

---

## 5. AUTHENTICATION & SECURITY

### Auth Flow
1. User signs up → Supabase Auth creates `auth.users` entry
2. Signup API creates `tenants` row and `users` row linked by `tenant_id`
3. Session stored in httpOnly cookies (hardened in middleware)
4. Every protected page uses `createServerSupabaseClient()` to verify session server-side
5. `getTenantId()` helper (`src/lib/auth/getTenantId.ts`) resolves `tenant_id` from session for API routes

### Middleware (`middleware.ts`)
- Protects `/dashboard/*` and `/admin/*`
- Redirects logged-in users away from `/login`, `/signup`
- Injects `x-brand` header (aries/libra) based on hostname
- Rewrites `libraai.in/` → `/libra` page

### Token Encryption
- `gupshup_api_key`, `ig_access_token`, `wa_access_token` are **AES-256-GCM encrypted at rest**
- Use `encryptToken(value)` before DB insert, `decryptToken(value)` before API call
- Key = `ENCRYPTION_KEY` env var (64-char hex)

### Admin Access
- Requires both `users.is_platform_admin = true` AND `PLATFORM_ADMIN_EMAIL` env var match

---

## 6. WHATSAPP MESSAGE FLOW (Gupshup BSP)

### Inbound Message Pipeline
```
Customer WhatsApp → Gupshup servers → POST /api/webhooks/gupshup
  → parseGupshupWebhook() → isStatusUpdate?
    YES → handleStatusUpdate() → UPDATE messages SET status WHERE wa_message_id = ?
    NO  → isDuplicateMessage() check → after() fire-and-forget
            → handleIncomingMessage()
              → tenant lookup by gupshup_app_name
              → upsert lead (or find existing)
              → upsert conversation
              → save inbound message (status: 'delivered')
              → runFlowsForMessage() (visual flow engine)
              → processMessageWithAI() (Gemini)
                → RAG knowledge retrieval
                → smart rules check
                → build system prompt
                → Gemini 2.0 Flash API call
                → parse JSON response
              → sendTextMessage() via Gupshup API
              → save outbound message (status: 'sent')
              → update lead score
              → fireIntegrations() (Google Sheets, etc.)
```

### Outbound (Agent → Customer)
```
Agent types in dashboard → POST /api/chat/send
  → verify conversation belongs to tenant
  → INSERT message (status: 'pending')
  → sendTextMessage() via Gupshup → wa_message_id returned
  → UPDATE message SET status='sent', wa_message_id=?
```

### Status Update Pipeline
```
Gupshup → POST /api/webhooks/gupshup (message-event type)
  → handleStatusUpdate()
    → UPDATE messages SET status='delivered'/'read' WHERE wa_message_id=?
  → Real-time Supabase subscription in ChatArea.tsx picks it up
  → If real-time blocked by RLS → 10-second polling fallback (/api/dashboard/chat/statuses)
```

### Tick Display in Dashboard
- `sent` → single grey ✓
- `delivered` → double grey ✓✓
- `read` → double blue ✓✓

### Gupshup Webhook Configuration
- URL: `https://ariesai.in/api/webhooks/gupshup`
- Format: Gupshup format (v2)
- Events: Message, Enqueued, Sent, Delivered, Read, Failed + System events
- **`GUPSHUP_WEBHOOK_SECRET` env var must be EMPTY or deleted** — if set, webhook verifies a `?token=` param that Gupshup won't send

---

## 7. AI ENGINE (Gemini 2.0 Flash)

**File:** `src/lib/ai/engine.ts`

### What it does
- Receives full conversation history + tenant config
- Builds a system prompt with: business name/type, bot persona, USPs, working hours, custom FAQs, menu/pricing, off-hours rules, hot/warm keywords, smart rules
- Calls Gemini 2.0 Flash with `responseMimeType: 'application/json'`
- Returns structured JSON: `{ reply, intent, extractedData, sentiment, shouldEscalate, nextStep, confidence }`

### Intent Types
`greeting`, `reserve_table`, `private_event`, `corporate_booking`, `gift_occasion`, `general_enquiry`, `product_enquiry`, `complaint`, `payment_request`, `unknown`

### Escalation
- `shouldEscalate: true` → sets `conversation.bot_paused = true`, `conversation.escalated = true`
- Agent sees "Human mode active" in dashboard header
- Agent can toggle back to AI mode via dashboard

### RAG Pipeline
- `src/lib/ai/rag.ts` uses `text-embedding-004` (Gemini) to embed knowledge docs
- Stores 768-dim vectors in `knowledge_docs.embedding` (pgvector)
- Retrieves top-3 relevant docs by cosine similarity before AI call

---

## 8. DASHBOARD PAGES & FEATURES

### Live Chat (`/dashboard/chat`)
- **ChatSidebar** — lists all conversations, real-time updates via Supabase subscription
- **ChatArea** — message bubbles with tick indicators, AI/human mode toggle, message input
- **CRMPanel** — right panel: contact info, lead score, conversation stats, notes, assign agent
- All avatars = colored initials (NO DiceBear/external image APIs)
- Bot-generated messages have 🤖 icon

### Leads (`/dashboard/leads`)
- Lead cards with: name/phone, status badge (hot/warm/cold), lead score, channel icon
- CTWA (Click-to-WhatsApp) leads show "Meta Ad" badge
- Assigned agent shown as initials avatar in card footer

### Broadcast (`/dashboard/broadcast`)
- Send bulk WhatsApp messages to filtered lead segments
- Shows sent/delivered/replied counts

### AI Flows (`/dashboard/flows`)
- Visual drag-drop flow builder using @xyflow/react
- Node types: trigger, message, condition, delay, AI, action
- Templates for different business types (restaurant, hotel, etc.)
- Flows stored in `automation_flows` table

### AI Agents (`/dashboard/agents`)
- Configure multiple AI agent personas per tenant
- Each agent has: name, routing keywords, bot personality, system prompt

### Knowledge Base (`/dashboard/knowledge`)
- Upload documents for RAG
- Embeddings generated via Gemini text-embedding-004

### Analytics (`/dashboard/analytics`)
- Message volume charts, lead funnel, AI vs human ratio

### Smart Rules (`/dashboard/automations`)
- Rule-based triggers (e.g., "if message contains 'price' → send price list")

### Settings (`/dashboard/settings`)
- Business profile, bot config, WhatsApp connection, working hours

### Billing (`/dashboard/billing`)
- Plans: Starter ₹2,499/mo, Growth ₹4,999/mo, Pro ₹9,999/mo
- Razorpay subscription integration

### Team (`/dashboard/team`)
- Add team members, assign roles (owner/admin/staff/viewer)
- Lead auto-assignment with round-robin counter (`lead_assignment_counter` on tenants)

---

## 9. SUPABASE CLIENT USAGE RULES

**CRITICAL — RLS blocks browser client on most sensitive tables**

| Client | When to use |
|--------|-------------|
| `supabaseAdmin` (service role) | API routes, webhooks — bypasses RLS, full access |
| `createServerSupabaseClient()` | Server components, API routes needing user auth context |
| `createBrowserSupabaseClient()` | Client components UI only — limited by RLS |

**Pattern for dashboard data fetching:**
- Dashboard client components MUST call internal API routes (`/api/dashboard/...`)
- API routes use `supabaseAdmin` with explicit `tenant_id` filter
- Never query Supabase directly from client components for sensitive data

**Real-time subscriptions (ChatArea.tsx):**
- Uses `createBrowserSupabaseClient()` for `postgres_changes` events
- Listens for INSERT (new messages) and UPDATE (status changes) on messages table
- Fallback: 10-second polling via `/api/dashboard/chat/statuses` for status updates

---

## 10. ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Public anon key
SUPABASE_SERVICE_ROLE_KEY=          # Service role (never expose to client)

# App
NEXT_PUBLIC_APP_URL=https://ariesai.in
NEXT_PUBLIC_APP_NAME=Aries AI

# Security
ENCRYPTION_KEY=                     # 64-char hex (openssl rand -hex 32)
CRON_SECRET=                        # Protects /api/cron/* endpoints

# AI
GEMINI_API_KEY=                     # Google Gemini API key

# Gupshup (WhatsApp BSP)
# GUPSHUP_WEBHOOK_SECRET=           # DELETE THIS or leave EMPTY — causes webhook rejection

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_STARTER=
RAZORPAY_PLAN_GROWTH=
RAZORPAY_PLAN_PRO=

# Email
RESEND_API_KEY=

# Admin
PLATFORM_ADMIN_EMAIL=

# Instagram
META_VERIFY_TOKEN=                  # For Instagram webhook verification
META_APP_SECRET=                    # For Instagram webhook HMAC
```

---

## 11. CRITICAL ARCHITECTURAL RULES (NEVER BREAK THESE)

### 1. Lazy Initialization
Never use `new Client()` at module level. Always use getter functions:
```typescript
// WRONG
export const supabaseAdmin = createClient(url, key);

// CORRECT
let _client: SupabaseClient | null = null;
function getAdmin() {
  if (!_client) _client = createClient(url!, key!);
  return _client;
}
export const supabaseAdmin = new Proxy({}, { get: (_, prop) => getAdmin()[prop as keyof SupabaseClient] });
```
This applies to: `supabaseAdmin`, `GoogleGenAI`, `Razorpay`.

### 2. Tenant Isolation
Every DB query via admin client MUST include `.eq('tenant_id', tenantId)`. Never query without this.

### 3. Token Encryption
Always `decryptToken(tenant.gupshup_api_key)` before calling Gupshup API. Store encrypted.

### 4. BullMQ stays in worker.ts
All job queues, follow-up schedulers, broadcast workers live ONLY in `worker.ts`. Never import BullMQ in Next.js API routes.

### 5. after() for webhook fire-and-forget
The Gupshup webhook must respond to Gupshup in <5 seconds. Use Next.js 16's `after()` function to process message asynchronously after response is sent.

### 6. API routes for data, not browser Supabase
Dashboard pages use internal API routes for all data fetching. Browser Supabase client is only for real-time subscriptions and auth.

---

## 12. KNOWN ISSUES & CURRENT STATE

### Working ✅
- Full Gupshup WhatsApp message receive/send pipeline
- AI replies via Gemini 2.0 Flash
- Lead creation, scoring, CTWA detection
- Dashboard chat inbox with real-time messages
- Human mode toggle (pause/resume AI)
- Broadcast campaigns
- Visual flow builder
- Agent configuration
- Billing (Razorpay)
- Auth (signup/login/protected routes)
- Colorful initials avatars (DiceBear removed)
- Message status polling fallback

### Webhook Status Updates (requires Gupshup config)
- Gupshup webhook URL set to: `https://ariesai.in/api/webhooks/gupshup`
- `GUPSHUP_WEBHOOK_SECRET` must be deleted from Vercel env vars (was set to placeholder, was rejecting all webhooks)
- After fixing env var + redeploying, delivery/read receipts will update message ticks

### Pending / Not Yet Implemented
- Voice agent (`/voice-agent/` directory exists but incomplete)
- Google Calendar live integration
- Shopify webhook live integration
- Sentry error tracking (stub exists at `src/lib/sentry-stub.ts`)
- BullMQ worker not deployed to Render/Railway yet (follow-ups won't fire without it)

---

## 13. DUAL-BRAND ROUTING

The platform serves two brands from one Next.js app:

| Brand | Domain | Channel | Landing page |
|-------|--------|---------|-------------|
| Aries AI | ariesai.in | WhatsApp | `/` (page.tsx) |
| Libra AI | libraai.in | Instagram | `/libra` |

**Middleware detects brand from `host` header** → sets `x-brand: aries` or `x-brand: libra` on all requests.

The dashboard is currently Aries-only. Libra tenants would use the same dashboard, with Instagram-specific features shown based on their channel.

---

## 14. IMPORTANT FILE LOCATIONS QUICK REFERENCE

| What | Where |
|------|-------|
| Main types | `src/lib/types/index.ts` |
| Gupshup webhook handler | `src/app/api/webhooks/gupshup/route.ts` |
| Send message API | `src/app/api/chat/send/route.ts` |
| AI engine | `src/lib/ai/engine.ts` |
| Tenant config loader | `src/lib/tenant/manager.ts` |
| Chat sidebar | `src/app/dashboard/chat/ChatSidebar.tsx` |
| Chat message area | `src/app/dashboard/chat/ChatArea.tsx` |
| CRM right panel | `src/app/dashboard/chat/CRMPanel.tsx` |
| App sidebar nav | `src/app/dashboard/_layout/AppSidebar.tsx` |
| Dashboard home sections | `src/app/dashboard/_sections/` |
| Recent chats widget | `src/app/dashboard/_sections/RecentChats.tsx` |
| Leads page | `src/app/dashboard/leads/_components/LeadsClient.tsx` |
| Flow builder canvas | `src/app/dashboard/flows/_components/FlowCanvas.tsx` |
| Brand config | `src/lib/brand.ts` |
| Middleware | `middleware.ts` |
| Supabase admin | `src/lib/supabase/admin.ts` |
| Crypto utils | `src/lib/utils/crypto.ts` |
| DB schema | `src/lib/database/schema.sql` |

---

## 15. YOUR TASK

> Replace this line with your actual task for Claude.

**When responding:**
1. Always check `src/lib/types/index.ts` before adding new fields
2. Always use `supabaseAdmin` in API routes, never the browser client
3. Always include `tenant_id` in DB queries
4. Don't touch the lazy-init pattern on supabaseAdmin/Gemini
5. New dashboard data → add API route under `/api/dashboard/`, call it from client component
6. Any new DB columns → add a migration SQL file in `src/lib/database/migrations/`
