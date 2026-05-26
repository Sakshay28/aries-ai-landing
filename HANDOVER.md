# Aries AI — Complete Handover

_Last updated: 2026-05-26 · main @ latest_

The single source of truth for Aries AI. Anyone reading this — you, a future agent, a hire — should be able to ship from zero context.

---

## 0. TL;DR

- **Product:** Aries AI — WhatsApp-native AI customer support / lead capture / appointment booking automation for SMBs.
- **Channel:** WhatsApp Business via **Meta Cloud API direct** (no BSP middleman).
- **Domain:** `ariesai.in`
- **Repo:** [Sakshay28/aries-ai-landing](https://github.com/Sakshay28/aries-ai-landing) — `main` is production
- **Local path:** `/Users/sakshay/Desktop/project-bolt`
- **Live URLs:** `aries-ai-landing.vercel.app`, `ariesai.in`
- **Founder:** Sakshay (solo)
- **Stage:** Code complete, pre-launch, currently in build-verify + outreach loop

---

## 1. What it actually does

A merchant signs up, connects their WhatsApp Business number (Meta Cloud API), uploads their FAQs / menu / catalog, and configures an AI agent. From that moment:

1. Every inbound WhatsApp message hits Meta's webhook → our pipeline.
2. The pipeline classifies the message, runs any matching automation flow, and either:
   - replies with AI-generated answer (Gemini 2.0 Flash + RAG),
   - books an appointment (Google Calendar OAuth),
   - hands off to a human (pauses bot, alerts staff),
   - extracts contact info and saves a lead,
   - or fires a custom flow built in the visual flow builder.
3. The merchant sees everything in a WhatsApp-style dashboard: inbox, leads, conversations, analytics, broadcasts.

The merchant never touches Meta directly post-onboarding. Tokens are encrypted, refreshed, and used server-side.

---

## 2. Tech stack (frozen versions)

| Layer | Tech | Version | Notes |
|---|---|---|---|
| Runtime | Node | 20 (Vercel default) | |
| Framework | Next.js | **16.2.6** | App Router; build uses webpack (see §4 rule 8) |
| Language | TypeScript | strict | |
| UI | React | 19.2.4 | |
| Styling | Tailwind CSS | v4 | `@tailwindcss/forms` |
| Animation | Framer Motion | 12.38 | |
| Icons | lucide-react | 1.14 | |
| Flow Builder | `@xyflow/react` | 12.10 | |
| DB / Auth | Supabase | — | PostgreSQL + RLS + pgvector |
| AI | Google Gemini | 2.0 Flash | `@google/genai` |
| Embeddings | Google | `text-embedding-004` | |
| Background jobs | BullMQ | — | Upstash Redis |
| Payments | Razorpay | 2.9 | subscriptions + payment links |
| Email | Resend | 6.12 | |
| Charts | Recharts | 3.8 | NEVER inside global styled-jsx |
| Voice (separate) | LiveKit + Sarvam + Groq + Python | — | `voice-agent/` |
| Tests | Vitest | — | |
| Errors | Sentry | stubbed | re-enable post-launch |
| WhatsApp | **Meta Cloud API direct** | Graph v20 | `src/lib/meta/service.ts` |

Build command (production):
```bash
NODE_OPTIONS='--max-old-space-size=4096' next build --webpack
```
Webpack is intentional. Turbopack hangs with our recharts + styled-jsx legacy. Do NOT switch.

---

## 3. Repo structure

```
project-bolt/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── _components/              # Landing-page sections
│   │   ├── api/                      # Server routes
│   │   │   ├── admin/                # Admin panel APIs
│   │   │   ├── ai/                   # Gemini wrappers
│   │   │   ├── auth/                 # Supabase Auth helpers
│   │   │   ├── broadcasts/           # Bulk WhatsApp template sends
│   │   │   ├── chat/                 # /api/chat/upload — file attachment pipeline
│   │   │   ├── dashboard/            # All dashboard data APIs (flows, leads, conversations, settings, etc.)
│   │   │   ├── integrations/         # Pabbly, Google Sheets OAuth, Razorpay links
│   │   │   ├── onboard/              # Tenant signup flow
│   │   │   └── webhooks/             # whatsapp (Meta), razorpay, meta-leads
│   │   ├── dashboard/                # Authenticated dashboard UI
│   │   │   ├── chat/                 # Conversations + AI assist panel
│   │   │   ├── flows/                # Flow Builder (xyflow canvas)
│   │   │   ├── agents/               # Multi-agent routing
│   │   │   ├── broadcast/            # Campaign builder
│   │   │   ├── leads/                # CRM
│   │   │   ├── analytics/            # Recharts overview
│   │   │   ├── settings/             # Tenant config, integrations, team
│   │   │   └── …
│   │   ├── login/ signup/ onboard/
│   │   ├── data-deletion/            # GDPR page
│   │   ├── privacy/ terms/ support/  # Compliance
│   │   └── layout.tsx page.tsx       # Aries landing
│   │
│   ├── lib/
│   │   ├── ai/                       # Gemini engine, RAG, prompts
│   │   ├── auth/                     # getTenantId, session helpers
│   │   ├── billing/                  # Razorpay subscriptions
│   │   ├── broadcast/                # BullMQ queue
│   │   ├── database/                 # schema.sql + migrations/*.sql
│   │   ├── email/                    # Resend wrappers
│   │   ├── flows/                    # ★ engine.ts ★ — flow execution engine
│   │   ├── followup/                 # Follow-up scheduler
│   │   ├── meta/                     # ★ service.ts ★ — Meta Cloud API (THE WhatsApp send/receive layer)
│   │   ├── instagram/                # IG service module (utility, not a primary product surface)
│   │   ├── integrations/             # Pabbly runner, Google Sheets, Zoho, FB CAPI
│   │   ├── payments/                 # Razorpay payment links
│   │   ├── redis/                    # Upstash client
│   │   ├── supabase/                 # admin + browser client + ssr
│   │   ├── tenant/                   # manager.ts (tenant cache + lookup)
│   │   ├── types/                    # All shared TS types — Tenant, Lead, Message, etc.
│   │   ├── utils/                    # crypto.ts (AES-256-GCM), interpolate, etc.
│   │   └── webhook/                  # signature verification
│   │
│   ├── middleware.ts                 # auth + tenant resolution
│   ├── proxy.ts                      # routing helper
│   └── components/                   # Shared UI primitives (shadcn-style)
│
├── voice-agent/                      # Python voice stack (LiveKit + Sarvam + Groq) — separate process
├── _disabled/                        # Quarantined contaminated files — DO NOT restore verbatim
├── public/
├── .windsurf/                        # Windsurf workflows + rules
├── package.json
├── AGENTS.md                         # "This is NOT the Next.js you know" guard
└── HANDOVER.md                       # ← this file
```

---

## 4. Critical architecture rules (NEVER violate)

These have all been root-caused and cost real time. Treat them as immutable.

1. **Lazy init ALWAYS.** Never eagerly init `supabaseAdmin` / Razorpay / GenAI clients at module top-level. Use the **Proxy getter pattern** (see `src/lib/supabase/admin.ts`). Eager init breaks Vercel build.
2. **Never `NEXT_PUBLIC_*` for secrets.** Server-only env vars only.
3. **Always `.eq('tenant_id', tenantId)`** on every DB query. Multi-tenant isolation is enforced in code, not just RLS.
4. **All async jobs go through BullMQ `worker.ts`** — never inside Next.js API routes. Vercel kills functions after 10s/60s.
5. **Always encrypt OAuth / API tokens** with `src/lib/utils/crypto.ts` (AES-256-GCM) before storing in DB. Decrypt with `decryptToken()` at point of use.
6. **Meta Cloud API direct only.** Use `src/lib/meta/service.ts` for all WhatsApp send / receive. There is no BSP middleman.
7. **Recharts only via `next/dynamic` with `ssr: false`.** No global styled-jsx wrappers around chart areas. No giant inline config objects. The original broken overview is preserved at `_disabled/dashboard_page_with_recharts.tsx` as the cautionary tale.
8. **Build with webpack, not Turbopack.** Turbopack hangs on the recharts/styled-jsx legacy. Build script in `package.json` already enforces this.
9. **Stable baseline.** Anything before the post-Next.js-16.2.6 rebuild commit on `main` is contaminated. Files in `_disabled/` are quarantined — never restore verbatim.
10. **Build verification before merge.**
    ```bash
    rm -rf .next && perl -e 'alarm 180; exec @ARGV' npm run build
    ```
    If it doesn't finish in 180s it's hanging on jest-worker. Stop, bisect, fix at the file boundary that introduced the regression.
11. **For experimental restorations:** new branch → restore one file at a time → build after each → stop on regression. Never combine risky systems (recharts + styled-jsx + admin routes + webhooks) in the same branch.

---

## 5. Feature inventory

### 5.1 Built and verified ✅

#### Landing page (`/`)
- Premium dark theme
- Hero section + 10-min setup time messaging
- Integrations network graph (animated)
- Pricing section
- Premium open + scroll animations via Framer Motion
- Anti-emoji guidelines enforced (no emojis in landing copy unless explicitly requested)
- Responsive across mobile / tablet / desktop

#### Authentication & onboarding
- Supabase Auth (email/password + magic link)
- `/signup` → `/login` → `/onboard` 3-step wizard:
  1. Business profile (name, type, hours, address, services)
  2. AI assistant personality (tone, greeting, off-hours behaviour)
  3. WhatsApp activation — Meta Cloud API credentials capture (encrypted before storage)
- 5-seat team limit enforced in invite flow
- `inviteUserByEmail` — real Supabase invites (not mock inserts)
- Tenant resolution via `src/middleware.ts` + `src/proxy.ts` based on hostname

#### Dashboard

| Section | Path | Status |
|---|---|---|
| **Overview** | `/dashboard` | Live KPIs, simplified (recharts kept off this page to avoid build deadlock) |
| **Live Chat / Conversations** | `/dashboard/chat` | Full WhatsApp-style 3-column UI |
| **AI Agents** | `/dashboard/agents` | Multi-agent routing: Create / Edit / Delete / toggle-active |
| **AI Flows** | `/dashboard/flows` | Visual flow builder — see §6 |
| **Broadcast** | `/dashboard/broadcast` | Campaign builder + BullMQ queue |
| **Leads** | `/dashboard/leads` | Full CRM with tags, filters, source badges, round-robin assignment, CSV export |
| **Smart Rules** | `/dashboard/rules` | Keyword → action automation |
| **Knowledge Base** | `/dashboard/knowledge` | RAG-enabled, pgvector |
| **Templates** | `/dashboard/templates` | WhatsApp template management |
| **Event Logs** | `/dashboard/events` | Audit trail |
| **Integrations** | `/dashboard/integrations` | Pabbly, Google Sheets (OAuth), Zoho CRM, Razorpay payment links, FB CAPI |
| **Contacts** | `/dashboard/contacts` | Combined leads + cross-conversation view |
| **Team** | `/dashboard/team` | Invites with 5-seat limit, role management |
| **Billing** | `/dashboard/billing` | Razorpay subscription, plan switch, invoice history |
| **Business Profile** | `/dashboard/profile` | Logo, hours, address, services list — fed into AI prompt |
| **Settings** | `/dashboard/settings` | WhatsApp creds, AI tone, hours, off-hours msg, hot/warm keywords, escalation timeout, FAQs, outbound webhook URL |

##### Live Chat details
- Real-time message stream via Supabase Realtime channel (per-conversation subscription).
- Optimistic UI: user-typed message appears immediately, status updates from `sending` → `sent` → `delivered` → `read` via 3-second status polling on `/api/dashboard/chat/statuses`.
- AI Assist panel (right side) with one-click insert — Gemini suggests reply based on conversation context.
- **Attachment pipeline:** drag-drop or paperclip → `/api/chat/upload` → Supabase Storage `chat-attachments` bucket → `sendMediaMessage` via Meta Cloud API → message row inserted with `media_url`, `file_name`, `file_size`, `mime_type`, `media_caption`.
- Search across messages, emoji picker, more menu (copy / reply / delete).

#### AI engine
- `src/lib/ai/engine.ts` — Gemini 2.0 Flash with circuit breaker, retry, cost tracking
- Tenant-aware system prompt: tone + business profile + working hours + FAQs + RAG context
- `src/lib/ai/rag.ts` — pgvector match via `match_knowledge_docs` Postgres RPC
- Embedding model: `text-embedding-004`
- Hot-keyword detection (configurable per tenant) routes to specialised agent or escalates

#### Flow execution engine
- `src/lib/flows/engine.ts` — see §6
- Two modes: **dry-run** (simulation, no side-effects) and **live** (real execution)
- Persists `pending_flow_node` on conversations table for `wait_for_reply` resumption

#### Background workers
- `worker.ts` — BullMQ consumer for: broadcasts, follow-ups, integration triggers, scheduled flow triggers, conversation timeouts
- Deploys to Render or Railway (NOT Vercel — Vercel functions can't run long-lived BullMQ consumers)
- Redis: Upstash (free tier OK pre-launch)

#### Webhooks
- `/api/webhooks/whatsapp` — Meta Cloud API webhook (verify token + signature check via `src/lib/webhook/`)
- `/api/webhooks/razorpay` — payment event handler
- `/api/webhooks/meta-leads` — Lead Ads form submissions auto-create leads
- All inbound webhooks verify HMAC signatures before processing

#### Data deletion / compliance
- `/data-deletion` — GDPR-compliant deletion request page
- Privacy / Terms / Support pages live and linked from footer
- All tenant data is namespaced; deletion cascades via FK constraints

#### Other
- AES-256-GCM token encryption (`src/lib/utils/crypto.ts`)
- Rate limiting via Redis sliding-window
- Sentry stub (`src/lib/sentry-stub.ts`) — swap for real `@sentry/nextjs` post-launch
- Health check endpoint (`/api/health`)
- CI/CD via Vercel auto-deploy on push to `main`
- Vitest test suite (limited coverage, runs on `npm test`)

#### Voice agent (separate process)
- Python in `voice-agent/` directory
- Stack: LiveKit room → Sarvam AI (Hindi/English STT) → Groq (LLM) → ElevenLabs/Sarvam TTS
- Has its own migration: `voice-agent/supabase_voice_migration.sql`
- Not deployed yet — out of scope for primary launch

---

## 6. Flow Engine — every node

**51 distinct sidebar nodes across 8 categories, mapping to ~14 engine handlers.**

Sidebar definitions: `src/app/dashboard/flows/_components/FlowSidebar.tsx`
Engine handlers: `src/lib/flows/engine.ts`

### Execution context
```ts
interface ExecContext {
  tenantId: string;
  conversationId: string | null;
  leadId: string | null;
  phone: string;
  accessToken: string;       // Meta WhatsApp access token (decrypted)
  phoneNumberId: string;     // Meta phone number ID
  messageText: string;
  isFirstMessage: boolean;
  variables: Record<string, unknown>;
  dryRun?: boolean;          // simulation mode
  trace?: TraceStep[];       // populated during dryRun
}
```

### 6.1 Full sidebar inventory (all 51)

#### Triggers — 8 nodes (`#3B82F6` blue)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `trigger` | Message Trigger | `trigger` |
| `keyword_trigger` | Keyword Trigger | `trigger` |
| `button_trigger` | Button Click | `trigger` |
| `webhook_trigger` | Webhook Trigger | `trigger` |
| `schedule_trigger` | Scheduled Time | `trigger` |
| `inactivity_trigger` | Inactivity Trigger | `trigger` |
| `wait` | Wait for Event | `wait` |
| `resume` | Return to Listen | `resume` |

#### Messaging — 8 nodes (`#10B981` green)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `standard` | Send Message | `standard` |
| `send_media` | Send Media | `standard` ⚠ |
| `send_audio` | Send Audio | `standard` ⚠ |
| `send_buttons` | Interactive Buttons | `standard` |
| `send_list` | List Menu | `standard` |
| `format` | Format Response | `format` |
| `handoff` | Human Handoff | `handoff` |
| `assign_agent` | Assign to Agent | `standard` |

#### AI & Logic — 8 nodes (`#8B5CF6` purple)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `condition` | Logic Branch | `condition` |
| `interruption` | AI Intent Handling | `interruption` |
| `extract` | Extract Entities | `extract` |
| `memory` | Context Memory | `memory` |
| `knowledge` | AI Knowledge Base | `knowledge` |
| `sentiment` | Sentiment Analysis | `standard` |
| `intent_routing` | Intent Routing | `standard` |
| `end` | End Flow | `end` |

#### E-Commerce — 6 nodes (`#06B6D4` cyan)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `show_products` | Show Products | `standard` |
| `add_cart` | Add to Cart | `standard` |
| `checkout_link` | Checkout Link | `standard` |
| `payment_link` | Payment Link | `standard` |
| `order_tracking` | Order Tracking | `standard` |
| `returns_handler` | Returns Handler | `standard` |

#### Appointments — 5 nodes (`#F79009` orange)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `show_slots` | Show Slots | `standard` |
| `book_appt` | Book Appointment | `standard` |
| `reschedule` | Reschedule | `standard` |
| `intake_form` | Intake Form | `standard` |
| `appt_reminder` | Reminder | `standard` |

#### Lead Gen & CRM — 5 nodes (`#F04438` red)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `capture_lead` | Capture Lead | `standard` |
| `collect_data` | Collect Data Form | `collect_data` |
| `lead_quiz` | Lead Quiz | `standard` |
| `push_crm` | Push to CRM | `webhook` |
| `schedule_demo` | Schedule Demo | `standard` |

#### Integrations — 7 nodes (`#6366F1` indigo)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `webhook` | API Call | `webhook` |
| `gsheets` | Google Sheets | `webhook` |
| `gcal` | Google Calendar | `webhook` |
| `send_email` | Send Email | `standard` |
| `delay` | Time Delay | `delay` |
| `set_var` | Set Variable | `standard` |
| `update_tag` | Update Tag | `standard` ⚠ |

#### Custom — 4 nodes (`#64748B` slate)
| Sidebar ID | Label | Engine type |
|---|---|---|
| `custom_code` | Custom Code | `standard` |
| `custom_webhook` | Custom Webhook | `webhook` |
| `custom_prompt` | Custom AI Prompt | `interruption` |
| `custom_cond` | Custom Condition | `condition` |

⚠ = sidebar-engine type mismatch, see §10.

### 6.2 Engine handler semantics (the ~14 unique handlers)

#### Trigger handlers
- `trigger` — any-message / keyword / button / webhook / schedule / inactivity entry. Returns `nextId` to first downstream node.
- `wait` — pause until external event. Currently treated as time delay (known mismatch).
- `resume` — terminal-style; flow returns to listening mode, stops cleanly.

#### Send handlers
- `standard` — sends `node.data.content` as text via `sendTextMessage`. **Most messaging-category nodes route here**, including the broken `send_media`/`send_audio`/`send_buttons`/`send_list` that should ideally have their own handlers.
- `send_media` — image / video / audio / file via `sendMediaMessage` with `MetaMediaType`. **Currently dead code** — sidebar emits `type: "standard"` for these.

#### Logic handlers
- `condition` — field/operator/value matcher OR fallback keyword match. Branches `true` / `false`. Operators: `=`, `!=`, `>`, `<`, `contains`.
- `extract` — regex extraction of `email`, `phone`, `name` from inbound message into `ctx.variables`.
- `format` — stringifies `knowledge_result` / `webhook_response` into `formatted_message` (consumed by next send node).
- `memory` — persists `name` / `email` to `leads` table; full vars to `conversations.context` JSON.
- `knowledge` — keyword search across tenant's `knowledge_docs`; RAG pgvector in production.
- `interruption` — Gemini intent classifier; branches `success` / `fallback`.

#### Action handlers
- `webhook` — real HTTP POST/GET, stores JSON response in `ctx.variables[node.id]`. Branches `success` / `error`.
- `tag` — adds tag to lead via `leads.tags` array. Currently triggered accidentally via `node.id?.startsWith('tag')` rather than type match.
- `handoff` — sets `bot_paused=true` on conversation, fires `sendStaffAlert`.
- `delay` — `setTimeout` (max 5s in dryRun). Reads `node.data.seconds` OR `delay` OR `duration`.
- `book_appointment` — Google Calendar event via OAuth. Branches `success` / `error`.
- `ai_reply` — Gemini context-aware reply, sent via `sendTextMessage`.
- `wait_for_reply` — saves `pending_flow_node` on conversation, returns `stop:true`. Inbound webhook resumes from saved node.
- `collect_data` / `resume_parser` — multi-field capture (live execution stub — dryRun trace works).
- `end` — terminal, stops execution.

### Dry-run vs live execution
- `ctx.dryRun=true` (simulation): no DB writes, no API calls, no real sends.
- Each handler has an `if (ctx.dryRun)` guard that pushes a `TraceStep` and returns `nextId` early.
- Live path executes side-effects, may push to trace for logs.
- **Critical:** `ai_reply`, `interruption`, and `book_appointment` ALL have `dryRun` guards — adding new external-call nodes WITHOUT a guard will cause real charges / sends during simulation.

### Trace anatomy (what the simulator displays)
```ts
interface TraceStep {
  nodeId: string;
  nodeType: string;
  action: string;        // 18 distinct types — see ACTION_META in FlowSimulator.tsx
  payload?: unknown;     // human-readable detail
  variables?: Record<string, unknown>;  // snapshot for condition / extract / memory steps
  nextId?: string | null;
}
```

### Action → visual mapping (FlowSimulator)
Every action has an icon + colour in `ACTION_META`:

| Action | Icon | Colour | Meaning |
|---|---|---|---|
| `trigger_matched` | ▶ | blue | Flow entry |
| `condition_true` | ✓ | green | Branch passed |
| `condition_false` | ✗ | red | Branch failed |
| `webhook_call` | 🔗 | cyan | API request |
| `tag_lead` | 🏷 | amber | Tag added |
| `delay` | ⏱ | indigo | Time delay |
| `handoff` | 🤝 | pink | Bot paused, staff alerted |
| `wait_for_reply` | ⏳ | slate | Waiting for user input |
| `ai_intent` | 🧠 | purple | Interruption intent classification |
| `memory_saved` | 💾 | purple | Variables persisted |
| `knowledge_search` | 📚 | violet | Knowledge base query |
| `extract_entities` | 🔍 | teal | Regex extraction result |
| `format_message` | ✏ | sky | Format complete |
| `book_appointment` | 📅 | orange | Calendar event (would be) created |
| `collect_data` | 📋 | amber | Multi-field capture |
| `end_flow` | 🏁 | slate | Terminal node |
| `resume_flow` | ↩ | green | Return to listening |
| `node_executed` | ⚙ | grey | Unknown node type fallback |

### Recent overhaul (this session)
The simulation engine was previously broken in three subtle ways. Fixed in commit `c404ea9`:

1. **`ai_reply` had no `dryRun` guard** → was attempting real WhatsApp sends during simulation.
2. **`interruption` had no `dryRun` guard** → was making real Gemini API calls.
3. **`book_appointment` had no `dryRun` guard** → was attempting real Calendar event creation.
4. **`resume` node was unhandled** → fell through to "unknown" handler, never stopped.
5. **Most node types never pushed `TraceStep` entries** → empty trace → simulator showed nothing.
6. **Delay node read wrong field** (`seconds`/`delay`) but sidebar writes `duration` → always defaulted to 1s.

All fixed. Plus the simulator UI now renders all 18 action types with colour-coded chips, shows variables summary at end, and gives precise error hints (404 → "No trigger node found", empty trace → "Check node connections").

---

## 7. Database

### Schema reference
- `src/lib/database/schema.sql` — full canonical schema
- `src/lib/types/index.ts` — TypeScript mirror (Tenant, Lead, Message, Conversation, etc.)

### Core tables
- `tenants` — one per merchant. Holds Meta WhatsApp credentials (`wa_phone_number_id`, `wa_access_token` encrypted, `wa_business_account_id`, `wa_app_secret`, `wa_verify_token`), business profile, AI config, billing state.
- `leads` — contact records. Fields: `name`, `phone`, `email`, `lead_status`, `source`, `tags[]`, `assigned_to`, custom JSON.
- `conversations` — per-channel thread per lead. Fields: `lead_id`, `channel`, `current_step`, `context` (JSON), `escalated`, `bot_paused`, `pending_flow_node`, `last_message_at`.
- `messages` — every inbound + outbound. Fields: `conversation_id`, `direction`, `content`, `message_type`, `wa_message_id`, `status`, `ai_generated`, `ai_latency_ms`, attachment columns.
- `automation_flows` — flow builder output. Stores nodes + edges JSON.
- `agent_configs` — multi-agent routing rules.
- `knowledge_docs` — RAG documents with pgvector embeddings.
- `tenant_integrations` — per-tenant integration credentials (encrypted).
- `broadcast_campaigns` + `broadcast_recipients` — campaign tracking.
- `follow_ups` — scheduled follow-up jobs.
- `event_logs` — audit trail.
- `business_profiles` — per-tenant rich business info.
- `smart_rules` — keyword → action mappings.

### Migrations (in `src/lib/database/migrations/`)
Apply in date order in Supabase SQL Editor:

```
2026_05_05_brand_split.sql              ← tenants.brand column (legacy multi-tenant flag)
2026_05_18_automation_flows.sql         ← flow builder schema
2026_05_18_smart_rules.sql              ← keyword → action rules
2026_05_18_knowledge_base.sql           ← knowledge_docs table
2026_05_18_business_profiles.sql        ← per-tenant business info
2026_05_18_broadcast_replied.sql        ← reply tracking
2026_05_18_agent_configs.sql            ← multi-agent routing
2026_05_18_rag_pipeline.sql             ← pgvector + match_knowledge_docs RPC
2026_05_18_fix_rls_recursion.sql        ← RLS policy fix
2026_05_18_tenant_integrations.sql      ← integration credentials store
2026_05_18_gupshup_columns.sql          ← legacy (kept as historical record; columns no longer referenced by code)
2026_05_19_lead_assignment.sql          ← assigned_to + lead_assignment_counter
2026_05_21_meta_attribution.sql         ← Click-to-WhatsApp Ads referral tracking
2026_05_23_add_tags_column.sql          ← tags array on leads
2026_05_24_attachment_columns.sql       ← media_url / file_name / file_size / mime_type / media_caption on messages
```

> The `2026_05_18_gupshup_columns.sql` migration is kept for migration-trail integrity — the actual columns can stay in DB unused, OR a future cleanup migration can `DROP COLUMN`. The application code no longer reads or writes those fields.

### Storage buckets (Supabase Storage)
- `chat-attachments` — public bucket; user-uploaded files in dashboard chat (50 MB max)
- `knowledge-docs` — public bucket; merchant-uploaded RAG documents

---

## 8. Environment variables

### Required for production
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=               # ⚠ secret

# Meta Cloud API (WhatsApp Business)
META_VERIFY_TOKEN=                       # ⚠ secret — set in Meta App webhook config
META_APP_SECRET=                         # ⚠ secret — for HMAC signature verification

# Gemini (Google AI)
GOOGLE_AI_API_KEY=                       # ⚠ secret

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=                     # ⚠ secret
RAZORPAY_WEBHOOK_SECRET=                 # ⚠ secret

# Resend (transactional email)
RESEND_API_KEY=                          # ⚠ secret

# Redis (Upstash REST)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=                # ⚠ secret

# Worker (separate Render/Railway process)
REDIS_URL=                               # for BullMQ queue connection

# Encryption (AES-256-GCM master key)
ENCRYPTION_KEY=                          # ⚠ secret — 32-byte hex string

# Google OAuth (Sheets + Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=                    # ⚠ secret

# Sentry (post-launch)
SENTRY_DSN=                              # optional pre-launch
```

Set in Vercel project settings → Environment Variables. Never commit `.env`.

---

## 9. Pre-launch blockers (manual steps)

These cannot be automated. Do them in order before flipping live.

1. **Run all migrations** in Supabase SQL Editor (date order, see §7).
2. **Create Supabase Storage buckets:** `chat-attachments` (public), `knowledge-docs` (public).
3. **Set all env vars** in Vercel project settings (see §8).
4. **Deploy worker** (`worker.ts`) to Render or Railway. Use the same env vars + `REDIS_URL`.
5. **Meta Cloud API setup per tenant:**
   - Tenant creates a Meta Business app (or uses Embedded Signup once that's built).
   - Captures phone number ID, access token, business account ID, app secret, verify token.
   - Encrypted via `crypto.encryptToken()` and stored in `tenants` row.
   - Webhook URL set in Meta dashboard → `https://ariesai.in/api/webhooks/whatsapp`.
   - App switched to **Live mode** (not Development).
6. **Razorpay:**
   - Complete KYC.
   - Create subscription plans in Razorpay dashboard.
   - Set webhook → `https://ariesai.in/api/webhooks/razorpay`.
7. **Resend:** verify sending domain (likely `mail.ariesai.in`) — adds DKIM/SPF/DMARC records.
8. **DNS:** point `ariesai.in` → Vercel (already done).
9. **Remove dev bypass:** in `src/lib/auth/getTenantId.ts`, the test fallback (e.g. `return 'test-tenant-123'`) MUST be removed before live traffic.
10. **Sentry:** swap `src/lib/sentry-stub.ts` for real `@sentry/nextjs` and add `SENTRY_DSN`.

---

## 10. Known issues & TODOs

### Bugs / partial wiring
- **Flow node type mismatches:** `send_media` and `send_audio` nodes in the sidebar emit `type: "standard"` but the engine's dedicated `send_media`/`send_audio` handlers check for `type === 'send_media'` — never matches, fall through to text-send handler. Fix: change sidebar to emit correct types OR change engine to dispatch on `node.id`.
- **`update_tag` node** has `type: "standard"` in sidebar but engine `tag` handler matches on `type === 'tag' || node.id?.startsWith('tag')` — works by accident. Brittle.
- **`wait` node** has dual meaning: sidebar describes "Wait for Event"; engine treats as time delay. Either rename the sidebar node OR add a separate `wait_for_event` handler.
- **`collect_data` / `resume_parser`:** dryRun trace works; live execution is a stub (`return { nextId }` only). Needs real interactive WhatsApp message rendering.
- **FAQ section** on landing page: not yet built (flagged in roadmap).
- **CI workflow file:** not committed — PAT scope issue prevents adding `.github/workflows/ci.yml`. Manual `npm run build` for now.
- **Embedded Signup for Meta:** not built — currently merchants must self-provision their Meta app and paste credentials in the onboarding wizard. Embedded Signup would be one-click.

### Technical debt
- Recharts is the single biggest build-stability risk. If overview page hangs, `_disabled/dashboard_page_with_recharts.tsx` is the cautionary diff.
- `_disabled/DashboardShell.original.tsx` (520 lines) — likely culprit of past Next.js build deadlock (styled-jsx global + 46 inline style objects). Do NOT restore.
- `_disabled/dashboard_backup_phase1/dashboard.module.css` (944 lines, orphan).
- `2026_05_18_gupshup_columns.sql` migration columns can be dropped via a future cleanup migration once you're confident no historical data needs reading.

### Recently fixed (don't regress)
- Flow simulator hang / empty trace (commit `c404ea9`)
- Auto-open of node config panel on drop (commit `9dc0a18`)
- Node menu replaced 3-dot delete-only button (commit `9dc0a18`)
- Handle visibility / hover scaling (commits `4ea500e`, `7836279`, `d8c87ab`)
- Bezier edge upgrade for legacy edges (commit `97be8a1`)
- Drop position accuracy + 60fps canvas (commits `42cdc6e`, `dc48908`)
- Removed lock badges for plan-gated features (commits `678dd7c`, `769efc6`)
- Premium scroll animations on landing (commit `1aaed9d`)
- **Gupshup BSP layer fully removed** (this session) — codebase is now Meta direct only.

---

## 11. Webhook signature verification

Both inbound webhooks verify HMAC signatures before processing. Code in `src/lib/webhook/`.

### Meta WhatsApp
- Header: `x-hub-signature-256`
- Algorithm: HMAC-SHA256 with `tenant.wa_app_secret` (decrypted)
- Body: raw request body (must read before JSON parse)
- On verify token request (GET with `hub.verify_token`): compare against `tenant.wa_verify_token`

### Razorpay
- Header: `x-razorpay-signature`
- Algorithm: HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET` env var
- Body: raw request body

If either fails, the route returns 401 immediately and logs the violation.

---

## 12. Token encryption

Every secret stored in DB is encrypted at-rest with AES-256-GCM via `src/lib/utils/crypto.ts`.

```ts
encryptToken(plaintext: string): string  // returns base64(iv || authTag || ciphertext)
decryptToken(encrypted: string): string  // throws if tampered
```

Master key: `ENCRYPTION_KEY` env var, 32-byte hex.

Encrypted fields:
- `tenants.wa_access_token`
- `tenants.wa_app_secret` (sometimes)
- `tenant_integrations.credentials` (JSON, fields encrypted individually)
- Google OAuth refresh tokens

If `ENCRYPTION_KEY` is rotated, you MUST migrate all encrypted columns. There is no automatic re-encryption job — write a one-off script.

---

## 13. AI engine deep dive

`src/lib/ai/engine.ts` exports `processMessageWithAI(text, history, variables, tenantConfig, tenantId)`.

### Pipeline
1. **System prompt assembly** — `src/lib/tenant/manager.ts::getTenantConfig` returns:
   - Business name, type, hours, address
   - Tone (formal / casual / friendly)
   - First-message greeting
   - Off-hours message
   - Hot keywords (immediate escalation)
   - Warm keywords (high-priority response)
   - Custom FAQs (array of Q&A pairs)
   - Working hours JSON
2. **RAG context** — `src/lib/ai/rag.ts::matchKnowledgeDocs(query, tenantId, k=3)` calls the `match_knowledge_docs` Postgres RPC which uses pgvector cosine similarity. Top 3 chunks injected as context.
3. **Conversation history** — last N messages (configurable, default 10) prepended.
4. **Gemini call** — Gemini 2.0 Flash with circuit breaker. On 3 consecutive failures, breaker opens for 30s and returns canned fallback response.
5. **Response classification** — engine flags whether the reply is:
   - A normal answer
   - An escalation (sets `escalated=true`, fires `sendStaffAlert`)
   - A booking intent (triggers appointment flow)
   - A payment intent (generates Razorpay link)
6. **Cost tracking** — input/output tokens logged to `event_logs` for billing analytics.

### RAG ingestion
- Merchant uploads file via `/dashboard/knowledge`.
- File stored in `knowledge-docs` bucket.
- Background BullMQ job extracts text, chunks (~500 tokens, 50 overlap), embeds via `text-embedding-004`, inserts into `knowledge_docs` table with vector column.
- Queryable immediately after job completes.

---

## 14. Integrations

All in `src/lib/integrations/`. Each integration is a thin wrapper around its provider's API.

| Provider | Module | Auth |
|---|---|---|
| **Pabbly Connect** | `runner.ts` | Webhook URL only (no OAuth) |
| **Google Sheets** | `google-sheets.ts` | OAuth — full flow with `Connect with Google` button + `Sync All Leads` button |
| **Google Calendar** | (calendar OAuth path under integrations) | OAuth |
| **Zoho CRM** | `runner.ts` (case `zoho`) | OAuth |
| **Razorpay Payment Links** | `src/lib/payments/razorpay-links.ts` | API key |
| **FB CAPI** | `capi-trigger.ts` | App access token |

Lead events fire `IntegrationEvent` (`new_lead`, `booking_confirmed`, `payment_requested`) which dispatches to all enabled integrations in parallel.

---

## 15. Quick-start commands

```bash
# Install
npm install

# Dev (turbopack — fine for dev)
npm run dev

# Production build (webpack — required, see §4 rule 8)
NODE_OPTIONS='--max-old-space-size=4096' next build --webpack

# Test
npm test

# Lint
npm run lint

# Apply migrations (Supabase CLI, optional — preferred is SQL Editor in dashboard)
supabase db push

# Worker (separately, on Render/Railway)
node worker.ts
```

---

## 16. Memory bank for future agents

When you (or future Cascade) resume work, key context that's stored across sessions:

- **`AGENTS.md`** at repo root: "This is NOT the Next.js you know. Read `node_modules/next/dist/docs/` before writing any code."
- **Bug-fixing discipline:** minimal upstream fixes > downstream workarounds. Single-line changes when sufficient. Add regression tests but keep impl minimal.
- **Testing discipline:** design tests before major impl. Never weaken/delete tests without explicit user direction.
- **Planning cadence:** succinct plan, one step in progress at a time, refresh on new constraints.
- **Build discipline:** every code change → `rm -rf .next && perl -e 'alarm 180; exec @ARGV' npm run build` before merge.

---

## 17. Continuity

- **GitHub:** `Sakshay28/aries-ai-landing` (verify with `git remote -v`)
- **Vercel:** auto-deploys `main` to `aries-ai-landing.vercel.app` + `ariesai.in`
- **Supabase project:** check `NEXT_PUBLIC_SUPABASE_URL` for project ref
- **Founder email:** `founder@ariesai.in` (Zoho Mail)
- **Personal email:** `sakshayajwani@gmail.com`

---

_End of handover. If something is missing here, it's either in commit messages, in `AGENTS.md`, or it doesn't exist yet._
