# Aries AI — Complete Handover

_Last updated: 2026-05-26 · main @ `c404ea9`_

This is the single source of truth for the entire project. Anyone (you, a future agent, a hire) reading this should be able to ship from zero context.

---

## 0. TL;DR

- **What it is:** Multi-brand AI SaaS, two products on one codebase.
  - **Aries AI** (`ariesai.in`) — WhatsApp AI automation for Indian SMBs (restaurants, salons, clinics, real estate, dentists, lawyers).
  - **Libra AI** (`libraai.in`) — Instagram DM automation for creators / influencers.
- **Founder:** Sakshay (solo). Based in India.
- **Stage:** Code complete, pre-launch. Target launch May 12–15, 2026 (already past — currently running US cold outreach to validate demand before flipping live).
- **Revenue mode:** Razorpay subscriptions for India (Aries), Razorpay + Stripe-ready for global (Libra). Cold-email pricing for US: $149/mo single-loc, $249/mo multi-loc.
- **Repo:** [Sakshay28/aries-ai-landing](https://github.com/Sakshay28/aries-ai-landing) · `main` branch is production.
- **Local path:** `/Users/sakshay/Desktop/project-bolt`
- **Live URLs:** `aries-ai-landing.vercel.app`, `ariesai.in`. Libra subdomain not yet pointed.

---

## 1. Brands & positioning

### Aries AI — WhatsApp BSP automation
- **Channel:** WhatsApp Business via **Gupshup BSP** (NOT direct Meta Cloud API).
- **ICP:** Indian SMBs with WhatsApp inquiry volume — restaurants, salons, clinics, real estate, gyms, coaching, e-commerce, education.
- **Pricing (INR):** Starter ₹999 · Growth ₹2,499 · Pro ₹6,999 · Enterprise custom.
- **Pricing (US, demo-led):** $149/mo single location · $249/mo multi-location. Never quote in cold email — demo first, price on the call.

### Libra AI — Instagram DM automation
- **Channel:** Instagram Graph API (page-token OAuth).
- **ICP:** Creators, influencers, coaches, course sellers, e-com brands with comment/DM volume.
- **Pricing:** Free (3,000 conversations/mo) · Unlimited ₹349/mo. Aggressive freemium to drive volume.

Both brands share **one codebase, one DB, one webhook pipeline** — discriminated by `tenants.brand` column and routed via `src/proxy.ts`.

---

## 2. Tech stack (frozen versions)

| Layer | Tech | Version |
|---|---|---|
| Runtime | Node | 20 (Vercel default) |
| Framework | Next.js | **16.2.6** App Router + Turbopack-aware (build uses webpack: see `package.json`) |
| Language | TypeScript | strict |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS | v4 (`@tailwindcss/forms`) |
| Animation | Framer Motion | 12.38 |
| Icons | lucide-react | 1.14 |
| Flow Builder | `@xyflow/react` | 12.10 |
| DB / Auth | Supabase | PostgreSQL + RLS + pgvector |
| AI | Google Gemini | 2.0 Flash + `text-embedding-004` (`@google/genai`) |
| Background jobs | BullMQ + Upstash Redis | — |
| Payments | Razorpay | 2.9 (subscriptions + payment links) |
| Email | Resend | 6.12 |
| Charts | Recharts | 3.8 (NEVER global styled-jsx — see §6) |
| Voice (separate stack) | LiveKit + Sarvam AI + Groq + Python | `voice-agent/` |
| Tests | Vitest | — |
| Errors | Sentry | stubbed (`src/lib/sentry-stub.ts`) |
| WhatsApp BSP | **Gupshup** | replaces direct Meta — see §3 |

**Build command:** `NODE_OPTIONS='--max-old-space-size=4096' next build --webpack`
Webpack is intentional — Turbopack hangs with our recharts + styled-jsx legacy. Do NOT switch.

---

## 3. Critical architecture rules (NEVER violate)

These have all been root-caused and cost real time. Treat them as immutable.

1. **Lazy init ALWAYS.** Never eagerly init `supabaseAdmin` / Razorpay / GenAI clients at module level. Use the **Proxy getter pattern** (see `src/lib/supabase/admin.ts`). Eager init breaks Vercel build.
2. **Never `NEXT_PUBLIC_*` for secrets.** Server-only env vars only.
3. **Always `.eq('tenant_id', tenantId)`** on every DB query. Multi-tenant isolation is enforced in code, not just RLS.
4. **All async jobs go through BullMQ `worker.ts`** — never inside Next.js API routes (Vercel kills functions after 10s/60s).
5. **Never break `src/proxy.ts`** — it's the backbone of dual-brand routing (`ariesai.in` vs `libraai.in`).
6. **Always encrypt OAuth tokens** with `src/lib/utils/crypto.ts` (AES-256-GCM) before storing in DB. Decrypt with `decryptToken()` at point of use.
7. **Gupshup, not direct Meta.** Use `src/lib/gupshup/service.ts`. The Meta Cloud API code (`src/lib/meta/service.ts`) still exists for legacy/voice but flows + chat use Gupshup.
8. **Recharts only via `next/dynamic` with `ssr: false`.** No global styled-jsx. No giant inline config objects. Original broken overview preserved at `_disabled/dashboard_page_with_recharts.tsx` as the cautionary tale.
9. **Stable baseline:** commit `c7dce27` on `main` is the post-Next.js 16.2.6 build-deadlock rebuild. Anything before that is contaminated. Files in `_disabled/` are quarantined.
10. **Build verification before merge:** `rm -rf .next && perl -e 'alarm 180; exec @ARGV' npm run build` — if it doesn't finish in 180s it's hanging on jest-worker. Stop and bisect.

---

## 4. Repo structure

```
project-bolt/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── _components/              # Landing-page sections
│   │   ├── api/                      # Server routes
│   │   │   ├── admin/                # Admin panel APIs
│   │   │   ├── ai/                   # Gemini wrappers
│   │   │   ├── auth/                 # Supabase Auth helpers
│   │   │   ├── broadcasts/           # Bulk WhatsApp sends
│   │   │   ├── chat/                 # /api/chat/upload — file attachment pipeline
│   │   │   ├── dashboard/            # All dashboard data APIs (flows, leads, conversations, settings, etc.)
│   │   │   ├── integrations/         # Pabbly, Google Sheets OAuth, Razorpay links
│   │   │   ├── onboard/              # Tenant signup flow
│   │   │   └── webhooks/             # gupshup, whatsapp (legacy meta), instagram, razorpay
│   │   ├── dashboard/                # Authenticated dashboard UI
│   │   │   ├── chat/                 # Conversations + AI assist panel
│   │   │   ├── flows/                # Flow Builder (xyflow canvas)
│   │   │   ├── agents/               # Multi-agent routing
│   │   │   ├── broadcast/            # Campaign builder
│   │   │   ├── leads/                # CRM
│   │   │   ├── analytics/            # Recharts overview
│   │   │   ├── settings/             # Tenant config, integrations, team
│   │   │   └── …
│   │   ├── libra/                    # Libra AI landing page (sub-route)
│   │   ├── login/ signup/ onboard/
│   │   └── layout.tsx page.tsx       # Aries landing
│   │
│   ├── lib/
│   │   ├── ai/                       # Gemini engine, RAG, prompts
│   │   ├── auth/                     # getTenantId, session helpers
│   │   ├── billing/                  # Razorpay subscriptions
│   │   ├── broadcast/                # BullMQ queue
│   │   ├── database/                 # schema.sql + migrations/*
│   │   ├── email/                    # Resend wrappers
│   │   ├── flows/                    # ★ engine.ts ★ — flow execution engine
│   │   ├── followup/                 # Follow-up scheduler
│   │   ├── gupshup/                  # ★ service.ts ★ — current WhatsApp BSP
│   │   ├── instagram/                # IG DM processor
│   │   ├── integrations/             # Pabbly runner, Google Sheets, Zoho, capi
│   │   ├── meta/                     # Legacy Meta Cloud API (still used by voice/template)
│   │   ├── payments/                 # Razorpay payment links
│   │   ├── redis/                    # Upstash client
│   │   ├── supabase/                 # admin + browser client + ssr
│   │   ├── tenant/                   # manager.ts (tenant cache + lookup)
│   │   ├── types/                    # All shared TS types — Tenant, Lead, Message, etc.
│   │   ├── utils/                    # crypto.ts (AES-256-GCM), interpolate, etc.
│   │   └── webhook/                  # signature verification
│   │
│   ├── proxy.ts                      # ★ DUAL-BRAND ROUTING — DO NOT BREAK ★
│   ├── middleware.ts
│   └── components/                   # Shared UI primitives (shadcn-style)
│
├── voice-agent/                      # Python voice stack (LiveKit + Sarvam + Groq)
├── _disabled/                        # Quarantined contaminated files — DO NOT restore verbatim
├── public/
├── .windsurf/                        # Windsurf workflows + rules
├── package.json                      # next 16.2.6 / react 19.2.4 / tailwind 4
├── AGENTS.md                         # "This is NOT the Next.js you know" guard
└── HANDOVER.md                       # ← this file
```

---

## 5. Feature inventory

### 5.1 Built and verified ✅

#### Landing pages
- `/` Aries landing — premium dark theme, full sections (hero, integrations network graph, pricing, FAQ-pending, CTA)
- `/libra` Libra landing — sub-route, separate brand styling, free-tier focused
- 10-min setup time messaging, anti-emoji guidelines enforced
- Premium open & scroll animations via Framer Motion

#### Auth & onboarding
- Supabase Auth (email/password + magic link)
- `/onboard` flow — tenant creation, Gupshup credential capture, brand selection
- 5-seat team limit enforced. `inviteUserByEmail` for real Supabase invites (not mock).
- Tenant proxied automatically via `src/proxy.ts` based on hostname.

#### Dashboard
- **Overview** — live KPIs (no recharts on this page anymore — kept simple to avoid build deadlock)
- **Live Chat / Conversations** — full WhatsApp-style 3-column UI with:
  - Real-time message stream (Supabase Realtime channel)
  - AI Assist panel with one-click insert
  - **Attachment pipeline:** `/api/chat/upload` → Supabase Storage `chat-attachments` bucket → Gupshup media send (image/video/audio/file) — partially wired, see §11 known issues
  - Optimistic UI with status (sending / sent / failed)
  - Search, emoji picker, more menu, copy/reply/delete
- **AI Agents** (`/dashboard/agents`) — multi-agent routing. Create/Edit/Delete/toggle-active. Backed by `agent_configs` table.
- **AI Flows** (`/dashboard/flows`) — visual flow builder, see §7 below
- **Broadcast** — campaign builder + BullMQ queue, 5 msg/sec rate limit, retarget by segment
- **Leads** — full CRM, tags, filters, lead source badges (incl. `meta_ctwa` "From Ad"), round-robin assignment, CSV export
- **Smart Rules** — keyword → action automation
- **Knowledge Base** — RAG-enabled, pgvector, file upload to `knowledge-docs` bucket
- **Templates** — WhatsApp template management
- **Event Logs** — audit trail
- **Integrations** — Pabbly Connect, Google Sheets (real OAuth), Zoho CRM, Razorpay payment links, FB CAPI
- **Contacts** — combined leads + cross-conversation view
- **Team** — invites with 5-seat limit, role management
- **Billing** — Razorpay subscription management, plan switch, invoice history
- **Business Profile** — logo, hours, address, services list (used by AI prompt)
- **Settings** — Gupshup creds, AI tone, working hours, off-hours message, hot/warm keywords, escalation timeout, custom FAQs, outbound webhook URL

#### Webhooks
- `/api/webhooks/gupshup` — primary inbound for WhatsApp messages
- `/api/webhooks/whatsapp` — legacy Meta Cloud API (kept for fallback / voice)
- `/api/webhooks/instagram` — IG DM + comment processor (reel comment automation NOT built)
- `/api/webhooks/razorpay` — payment event handler
- All webhooks verify signatures via `src/lib/webhook/`

#### AI engine
- `src/lib/ai/engine.ts` — Gemini 2.0 Flash with circuit breaker, retry, cost tracking
- Tenant-aware system prompt assembly (tone + business profile + working hours + FAQs + RAG context)
- `src/lib/ai/rag.ts` — pgvector match via `match_knowledge_docs` RPC
- Embedding model: `text-embedding-004`

#### Background workers
- `worker.ts` — BullMQ consumer for: broadcasts, follow-ups, integration triggers
- Deploys to Render or Railway (NOT Vercel)
- Redis: Upstash (rate-limited free tier OK for now)

#### Other
- AES-256-GCM token encryption (`src/lib/utils/crypto.ts`)
- GDPR data deletion endpoint + UI page (`/data-deletion`)
- Rate limiting via Redis sliding window
- Sentry stub (real Sentry dropped to keep build fast — re-enable post-launch)
- Health check (`/api/health`)
- CI/CD via Vercel auto-deploy on push to `main`
- Vitest test suite (limited coverage)

#### Voice agent (separate process)
- Python in `voice-agent/`
- LiveKit room → Sarvam AI (Hindi/English STT) → Groq (LLM) → ElevenLabs/Sarvam TTS
- Has its own `supabase_voice_migration.sql`
- Not deployed yet

---

## 6. Recent fixes (last session)

### Flow Simulator overhaul (commit `c404ea9`, today)
**Problem:** Simulation hung / showed nothing for 90% of flows.

**Root causes (all in `src/lib/flows/engine.ts`):**
1. `ai_reply` node had **no `dryRun` guard** → would attempt real WhatsApp sends with `accessToken: 'sim'` on every test (silent fail).
2. `interruption` node had no `dryRun` guard → made real Gemini API calls during simulation.
3. `book_appointment` had no `dryRun` guard → tried real Google Calendar event creation.
4. `resume` node was unhandled → fell through to "unknown" handler, never stopped execution.
5. Most node types (trigger, condition, memory, extract, format, knowledge, end) **never pushed `TraceStep` entries** → empty trace → simulator showed nothing.
6. Delay node read `node.data.seconds ?? node.data.delay` but FlowSidebar writes `node.data.duration` → always defaulted to 1s.

**Fix:**
- Added `dryRun` guards to all 3 critical nodes.
- Added trace pushes for all 18 action types: `trigger_matched`, `condition_true/false`, `memory_saved`, `extract_entities`, `format_message`, `knowledge_search`, `end_flow`, `resume_flow`, `ai_intent`, `node_executed`, etc.
- Added missing `resume` and `collect_data` / `resume_parser` handlers.
- Fixed delay to read `duration` field.

### FlowSimulator UI overhaul (same commit)
- Renders all 18 trace action types: `send_message` as chat bubble, all others as colour-coded pill chips with emoji + detail text.
- Variables summary appears at end if extract/webhook/memory captured data.
- Smart error hints: 404 → "No trigger node found", empty trace → "Check node connections".
- Reset button. Auto-scroll to latest. Input disabled when `flowId === 'new'`.

### Node menu + drop UX (commit `9dc0a18`, today)
- Removed auto-open of config panel on node drop.
- Replaced 3-dot delete button with full **NodeMenu dropdown** (Edit / Duplicate / Delete) using React `createPortal`.

### Earlier wins
- Handle visibility / hover scaling fixes (commits `4ea500e`, `7836279`, `d8c87ab`)
- Bezier edge upgrade for legacy edges (`97be8a1`)
- Drop position accuracy + 60fps canvas (`42cdc6e`, `dc48908`)
- Removed lock badges for plan-gated features (`678dd7c`, `769efc6`) — every feature open during launch push
- Premium scroll animations on landing (`1aaed9d`)

---

## 7. Flow Engine — every node type

Located in `src/lib/flows/engine.ts`. Defined in `src/app/dashboard/flows/_components/FlowSidebar.tsx`.

### Trigger nodes (entry points)
| ID | type | Purpose |
|---|---|---|
| `trigger` | `trigger` | Any-message trigger |
| `keyword_trigger` | `trigger` | Match specific keywords |
| `button_trigger` | `trigger` | Reply to interactive button |
| `webhook_trigger` | `trigger` | External webhook fires flow |
| `schedule_trigger` | `trigger` | Cron-style scheduled fire |
| `inactivity_trigger` | `trigger` | After N hours of silence |
| `wait` | `wait` | Wait for an event (currently treated as time delay in engine — TODO: separate handler) |
| `resume` | `resume` | Returns flow to listening mode (stops cleanly) |

### Send nodes
| ID | type | Engine handler |
|---|---|---|
| `standard` | `standard` | Sends `node.data.content` as text |
| `send_media` | `standard` | Sends `node.data.content` (engine has dedicated `send_media` handler that's currently dead code — sidebar emits type=`standard`. **TODO:** fix) |
| `send_audio` | `standard` | Same — dedicated handler unused |
| `interactive_buttons` | `standard` | Quick reply buttons |
| `list_message` | `standard` | List picker |

### Logic nodes
- `condition` — field/operator/value or fallback keyword match. Branches `true` / `false`.
- `extract` — regex pulls `email`, `phone`, `name` from message into `ctx.variables`.
- `format` — stringifies `knowledge_result` / `webhook_response` into `formatted_message`.
- `memory` — persists `name`, `email` to `leads` table; full vars to conversation context.
- `knowledge` — keyword search across tenant's `knowledge_docs` (RAG-aware in production).
- `interruption` — Gemini intent classifier; branches `success` / `fallback`.

### Action nodes
- `webhook` — real HTTP POST/GET, stores JSON response in `ctx.variables[node.id]`. Branches `success` / `error`.
- `tag` — adds tag to lead.
- `handoff` — sets `bot_paused=true` on conversation, alerts staff.
- `delay` / `wait` — `setTimeout` (max 5s in dryRun). Reads `seconds`, `delay`, OR `duration`.
- `book_appointment` — Google Calendar event. Branches `success` / `error`.
- `ai_reply` — Gemini context-aware reply, sent via WhatsApp.
- `wait_for_reply` — saves `pending_flow_node` on conversation, returns `stop:true`. Inbound webhook resumes from saved node.
- `collect_data` / `resume_parser` — multi-field capture. Production-side wiring TBD.
- `end` — terminal, stops execution.

### Dry-run vs live execution
- `ctx.dryRun=true` means simulation: no DB writes, no API calls, no real sends.
- Each handler has `if (ctx.dryRun)` early return that pushes a `TraceStep` and returns next node.
- Live path executes the side-effect, may push to trace for logs.

### Trace anatomy
```ts
interface TraceStep {
  nodeId: string;
  nodeType: string;
  action: string;        // see ACTION_META in FlowSimulator.tsx for all 18 types
  payload?: unknown;     // human-readable detail string
  variables?: Record<string, unknown>;  // snapshot for condition / extract / memory steps
  nextId?: string | null;
}
```

### Visual mapping (FlowSimulator)
Every action has an icon + colour in `ACTION_META`:
- 🚀 trigger (blue) · ✓/✗ condition (green/red) · 🔗 webhook (cyan) · 🏷 tag (amber)
- ⏱ delay (indigo) · 🤝 handoff (pink) · ⏳ wait (slate) · 🧠 ai_intent (purple)
- 💾 memory (purple) · 📚 knowledge (violet) · 🔍 extract (teal) · ✏ format (sky)
- 📅 appointment (orange) · 📋 collect_data (amber) · 🏁 end · ↩ resume (green)

---

## 8. Database

### Migrations (in `src/lib/database/migrations/`)
Run order matters — apply in date order in Supabase SQL editor.

```
2026_05_05_brand_split.sql              ← tenants.brand column
2026_05_18_automation_flows.sql         ← flow builder schema
2026_05_18_smart_rules.sql              ← keyword → action rules
2026_05_18_knowledge_base.sql           ← knowledge_docs table
2026_05_18_business_profiles.sql        ← per-tenant business info
2026_05_18_broadcast_replied.sql        ← reply tracking
2026_05_18_agent_configs.sql            ← multi-agent routing
2026_05_18_rag_pipeline.sql             ← pgvector + match_knowledge_docs RPC
2026_05_18_fix_rls_recursion.sql        ← RLS policy fix
2026_05_18_tenant_integrations.sql      ← integration credentials store
2026_05_18_gupshup_columns.sql          ← gupshup_api_key/phone/app_name
2026_05_19_lead_assignment.sql          ← assigned_to + lead_assignment_counter
2026_05_21_meta_attribution.sql         ← CTWA referral tracking
2026_05_23_add_tags_column.sql          ← tags array on leads
2026_05_24_attachment_columns.sql       ← media_url / file_name / file_size / mime_type / media_caption on messages
```

### Storage buckets (Supabase Storage)
- `chat-attachments` — public, files sent via dashboard chat (50MB max)
- `knowledge-docs` — public, RAG documents

### Schema reference
- `src/lib/database/schema.sql` — full canonical schema
- `src/lib/types/index.ts` — TypeScript mirror (Tenant, Lead, Message, Conversation, etc.)

---

## 9. Environment variables

### Required for production
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=                # public OK
NEXT_PUBLIC_SUPABASE_ANON_KEY=           # public OK
SUPABASE_SERVICE_ROLE_KEY=               # ⚠ secret

# Gemini
GOOGLE_AI_API_KEY=                       # ⚠ secret

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=                     # ⚠ secret
RAZORPAY_WEBHOOK_SECRET=                 # ⚠ secret

# Resend
RESEND_API_KEY=                          # ⚠ secret

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=                # ⚠ secret

# Encryption (AES-256-GCM key)
ENCRYPTION_KEY=                          # ⚠ secret, 32-byte hex

# Google OAuth (Sheets + Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=                    # ⚠ secret

# Gupshup (set per-tenant in DB; this is just for testing)
GUPSHUP_API_KEY=                         # ⚠ secret (optional fallback)

# Meta Cloud API (legacy fallback)
META_VERIFY_TOKEN=                       # ⚠ secret
META_APP_SECRET=                         # ⚠ secret

# Worker
REDIS_URL=                               # for BullMQ if not using Upstash REST
```

### Set in Vercel project settings, not committed to repo.

---

## 10. Pre-launch blockers (manual steps)

These cannot be automated. Do them in order before flipping live.

1. **Run all 15 migrations** in Supabase SQL Editor (date order).
2. **Create Supabase Storage buckets:** `chat-attachments` (public), `knowledge-docs` (public).
3. **Set all env vars** in Vercel project settings.
4. **Deploy worker** (`worker.ts`) to Render or Railway with the same env vars + `REDIS_URL`.
5. **Gupshup BSP setup:**
   - Create Gupshup app, get API key + phone number + app name.
   - Set webhook URL → `https://ariesai.in/api/webhooks/gupshup`.
   - For each tenant, store credentials encrypted in `tenants.gupshup_api_key` etc.
6. **Meta Cloud API** (only if using fallback): switch app to Live mode + set webhook URLs.
7. **Razorpay:** complete KYC, create subscription plans (Starter/Growth/Pro for Aries; Unlimited for Libra).
8. **Resend:** verify sending domain (likely `mail.ariesai.in`).
9. **DNS for libraai.in:** point to Vercel, add as alias domain in project.
10. **Remove dev bypass:** in `src/lib/auth/getTenantId.ts`, the test bypass (`return 'test-tenant-123'`) must be removed before deploy.
11. **Sentry:** swap `src/lib/sentry-stub.ts` import for real `@sentry/nextjs` and add `SENTRY_DSN`.

---

## 11. Known issues & TODOs

### Bugs / partial wiring
- **Chat upload Gupshup send NOT yet committed.** The `/api/chat/upload` route currently uploads to Supabase Storage and inserts the message row, but does NOT call `sendMediaMessage` from Gupshup. Diff was prepared this session but commit was cancelled. **Action:** re-apply the Gupshup wiring in `src/app/api/chat/upload/route.ts` (see §6 in this file's history or last cancelled commit).
- **Flow node type mismatches:** `send_media` and `send_audio` nodes in the sidebar emit `type: "standard"` but the engine's dedicated `send_media`/`send_audio` handlers check for `type === 'send_media'` — never matches. They're served by the standard text-send handler instead. Fix: either change sidebar to emit correct types OR change engine to dispatch on `node.id`.
- **`update_tag` node** has `type: "standard"` in sidebar but the engine `tag` handler matches on `type === 'tag' || node.id?.startsWith('tag')` — works by accident. Brittle.
- **`wait` node** has dual meaning: sidebar describes it as "Wait for Event", engine treats it as time delay. Either rename or split.
- **FAQ section** on landing page — flagged for build, not yet built.
- **CI workflow file** — PAT scope issue prevents adding `.github/workflows/ci.yml`. Manual `npm run build` for now.
- **Reel comment automation** for Libra — not built. IG DM works.

### Uncommitted local changes (as of `git status`)
```
M src/app/dashboard/flows/_components/FlowInspector.tsx
M src/app/dashboard/flows/editor/[id]/page.tsx
```
These are likely WIP from the FlowSimulator session. Verify before committing.

### Performance / safety
- Recharts is the single biggest build risk. If overview page hangs, `_disabled/dashboard_page_with_recharts.tsx` is the cautionary diff.
- Always create a new branch for any experimental restoration. Build (`rm -rf .next && perl -e 'alarm 180; exec @ARGV' npm run build`) after each slice.
- If build process hangs at 99% CPU on `jest-worker`, kill and bisect the last file change.

---

## 12. Sales / GTM

### Outreach so far (~40 cold emails)
Sent from `founder@ariesai.in` via Zoho Mail. Spam score 10/10 (verified via mail-tester.com).

**Done niches:**
- Houston personal injury / criminal defense lawyers
- Austin dentists, Dallas dentists, Houston dentists (in progress)

**Next niches (ranked):**
1. Med Spas / Aesthetics — Dallas/Houston suburbs
2. HVAC / Plumbers / Roofers — Phoenix AZ, Houston TX
3. Veterinary clinics

**Skip always:** DSO chains (Heartland, Aspen, Pacific Dental, D4C, ProSmile, Affordable Dentures), corporate law firms, healthtech/biotech/pharma, non-US (.ca/.co.uk/.ba), 11+ employees.

### Lead sources (free tiers)
- **Apollo.io** — 50 emails/mo, best for US small practices, no CCPA wall
- **Hunter.io** — 25 domain searches/mo, best for finding emails from domains
- **Lusha** — 40 credits/mo, but CCPA-blocked on US contacts on free plan
- **Snov.io** — 50 credits/mo, bulk from CSV
- **FindThatLead / Skrapp.io** — 50/mo each

### Templates (in memory; use these verbatim)
**Dentists subject:** "[Practice Name] is losing patients every night"
**Lawyers subject:** "someone tried to hire you last night"
**Already has bot subject:** "your chatbot is losing you patients"
**Follow-up #1 (Wed, 48h after):** "Re: [original]" + "Just bumping this up..."

### Outreach rules
- Never send from main `ariesai.in` domain for cold.
- No dollar figures in cold emails.
- No bold text, no 3-line bullet structure (looks AI-generated).
- CTA always: "want to see how it looks on `[domain]`?"
- Sign off as "Founder, Aries AI" (not personal name).
- Stop after 3 emails per contact.
- Skip companies with "Group", "Brands", "Alliance", "Partners", "Network" in name.

### Other channels (not yet started)
LinkedIn DMs · Instagram DMs (#austindentist etc.) · Facebook small-biz groups · Cold calling via Google Voice · Google Maps emails · Yelp public emails.

---

## 13. Memory bank for future agents

When you (or future Cascade) resume work, key context that's stored across sessions:

- **`AGENTS.md`** at repo root: "This is NOT the Next.js you know. Read `node_modules/next/dist/docs/` before writing any code."
- Stable baseline commit: `c7dce27` on `main`.
- Bug-fixing discipline: minimal upstream fixes > downstream workarounds. Single-line changes when sufficient. Add regression tests but keep impl minimal.
- Testing discipline: design tests before major impl. Never weaken/delete tests without explicit user direction.
- Planning cadence: succinct plan, one step in progress at a time, refresh on new constraints.

---

## 14. Quick-start commands

```bash
# Install
npm install

# Dev (turbopack — fine for dev)
npm run dev

# Production build (webpack — required, see §2)
NODE_OPTIONS='--max-old-space-size=4096' next build --webpack

# Test
npm test

# Lint
npm run lint

# Apply migrations (Supabase CLI, optional)
supabase db push

# Worker (separately, on Render/Railway)
node worker.ts
```

---

## 15. Contact / continuity

- **GitHub:** `Sakshay28/aries-ai-landing` (note: memory previously said `Sakshay-28` — check actual remote with `git remote -v`)
- **Vercel:** auto-deploys `main` to `aries-ai-landing.vercel.app` + `ariesai.in`
- **Supabase project:** check `NEXT_PUBLIC_SUPABASE_URL` for project ref
- **Sender email:** `founder@ariesai.in` (Zoho Mail)
- **Founder:** Sakshay (sakshayajwani@gmail.com per dashboard sidebar)

---

_End of handover. If something is missing here, it's either in commit messages, in `AGENTS.md`, or it doesn't exist yet._
