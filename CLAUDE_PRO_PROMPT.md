# ⚡ Project Bolt — The Definitive "0 to 100" Architecture & Pro Prompt

This document is the absolute source of truth for **Project Bolt**, a multi-tenant AI SaaS platform for WhatsApp and Instagram. It explains the entire architecture, database schema, infrastructure, and enterprise security fixes applied from scratch (0 to 100%).

Provide this entire document to **Claude** (or any AI) so it understands the full system context and can immediately resume development without breaking critical production patterns.

---

## 1. 🌟 Platform Overview & Tech Stack
**Status:** 100% Production-Ready (Zero Build Errors, Zero TypeScript Errors). All mock data is removed; everything is wired to real APIs. 

**Core Tech Stack:**
- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL with Row-Level Security for strict tenant isolation)
- **AI Engine:** Google Gemini 2.0 Flash (Function calling & JSON structured output)
- **Job Queue & Deduplication:** Redis (Upstash) & BullMQ (Via Standalone `worker.ts`)
- **Payments:** Razorpay Subscriptions
- **Authentication:** Supabase Auth + Next.js 16 Middleware (`src/middleware.ts`)
- **Security:** Node.js Crypto (AES-256-GCM) + Webhook Signatures

---

## 2. 🗄️ Database Architecture & Tenant Isolation
The system strictly enforces **Row-Level Security (RLS)**. Every major table contains a `tenant_id` column, and Supabase RLS policies guarantee that cross-tenant data leakage is impossible at the database level. Every query must either include `.eq('tenant_id', ...)` or rely on the RLS context.

### Core Tables (`src/lib/database/schema.sql`):
1. **`tenants`**: The core business entity. Stores AI bot configuration (personality, USPs, working hours, custom FAQs), WhatsApp credentials (`wa_phone_number_id`), Instagram credentials, and Billing/Plan data.
2. **`users`**: Platform users (dashboard access) linked to a `tenant_id` via Supabase Auth.
3. **`leads`**: End-customers messaging the WhatsApp/Instagram bot.
4. **`conversations`**: Active chat sessions. Tracks the AI's state machine.
5. **`messages`**: Individual inbound/outbound chat logs.
6. **`follow_ups`**: Scheduled automated messages managed by BullMQ.
7. **`audit_logs`**: SOC2 Compliance logging for system actions.

---

## 3. 🏗️ Enterprise Infrastructure & Crucial Fixes Implemented

### A. Dedicated BullMQ Worker (`worker.ts`)
Vercel serverless functions instantly kill background threads. To solve this, all asynchronous BullMQ jobs (AI follow-ups, webhook queueing) have been extracted from Next.js completely. They run inside `worker.ts`, a persistent Node.js process. **Do not attempt to run BullMQ within the Next.js API routes.**

### B. Build-Time Crash Prevention (Lazy Initialization)
In Next.js, modules are imported during the static build phase. Eagerly initializing services using environment variables that don't exist at build time causes crashes.
- **Fix:** Proxies and getters. Never use eager `new Client()` at the module level.
- **Affected Services:** `supabaseAdmin` (`src/lib/supabase/admin.ts`), `Razorpay`, and `Google GenAI`.

### C. Security & Cryptography At Rest
- **Token Encryption:** `wa_access_token` is encrypted at rest using AES-256-GCM (`src/lib/utils/crypto.ts`). Tokens are encrypted on write (Onboarding) and decrypted on read milliseconds before hitting the Meta API (`src/lib/whatsapp/service.ts`).
- **Webhook Defenses:** All incoming Meta traffic is rate-limited and cryptographically validated via `x-hub-signature-256`. 
- **Admin Defense:** The `/admin` panel requires both a database role flag AND a hardcoded environment variable (`PLATFORM_ADMIN_EMAIL`) to prevent privilege escalation.

### D. Observability, Rate Limiting & Performance
- **Structured Logging:** `src/lib/utils/logger.ts` intercepts console outputs and formats them as parsable JSON in production.
- **Serverless Rate Limiting:** All endpoints use Redis-backed rate limiting. Do not use in-memory Map rate limiters as they are ephemeral on Vercel.
- **Payload Guard:** Webhooks strictly reject payloads over 2MB.
- **Database Caching:** Core lookups like `getTenantId` are cached in Redis for 1 hour. However, billing/usage checks must ALWAYS bypass the cache and query the DB natively to prevent race conditions.
- **Dead-Letter Queues:** All BullMQ failures report to Sentry and log to the `analytics_events` DB table.
- **Health Checks:** `/api/health` continuously polls the database and Redis for uptime monitoring.
- **Automated CI/CD:** `.github/workflows/ci.yml` strictly enforces TypeScript integrity and builds.

---

## 4. 🧠 The AI Engine (`src/lib/ai/engine.ts`)

The AI engine uses Google Gemini 2.0 Flash to act as the conversational agent.
- **Circuit Breaker:** Gemini API calls are wrapped in a 15,000ms `withTimeout()`. If the LLM hangs, it gracefully degrades to a deterministic fallback.
- **Token Tracking:** Every invocation pushes `totalTokenCount` to `ai_tokens_used_this_month` via Supabase RPC.
- **Structured Output:** We strictly enforce JSON outputs by passing `responseMimeType: 'application/json'` directly to the Gemini model configuration to prevent parser crashes.
- **Schema Mapping:** We force Gemini to output a strict JSON structure containing: `reply`, `intent`, `extractedData`, `sentiment`, and `nextStep`.

---

## 🚀 INSTRUCTIONS FOR CLAUDE (Prompt to copy-paste to Claude)

When passing this project to Claude, append the following prompt:

> "Claude, I am providing you with the complete architectural audit of 'Project Bolt', a Next.js 16 enterprise-grade multi-tenant AI SaaS for WhatsApp & Instagram. 
> 
> The application is currently 100% build-error free and production-ready. All mock data has been replaced with real APIs, the auth proxy is implemented, BullMQ workers have been decoupled into a standalone `worker.ts` process, and `wa_access_token` is strictly AES-256 encrypted at rest.
> 
> **Your MANDATORY rules for future development:**
> 1. **Do not break the lazy-initialization pattern**: For Supabase Admin, GenAI, and Razorpay, continue using the proxy getters so the Next.js build doesn't crash without env vars. NEVER use eager module-level initialization.
> 2. **Maintain Tenant Isolation**: Every DB query must include `.eq('tenant_id', ...)` or rely safely on the established RLS policies.
> 3. **Never expose plaintext tokens**: Any interaction reading `wa_access_token` from the database must pass it through `decryptToken()` from `crypto.ts` before using it.
> 4. **Do not put background queues in Next.js**: All BullMQ jobs (Follow-ups, Webhooks, Broadcasts) MUST remain in `worker.ts`. Do not re-introduce them to `instrumentation.ts` or API routes.
> 5. **When adding new AI features**, update `TenantAIConfig` in `types.ts`, `manager.ts`, and the system prompt in `engine.ts` simultaneously.
> 6. **Do NOT suggest fixing Auth Middleware, Serverless Rate Limiting, JSON Enforcement, Billing Cache Bypasses, Broadcast Timeouts, payload limits, Token Expiry Emails or DB Indexes.** These have all been meticulously solved and implemented in the current codebase!
> 
> Acknowledge you understand this architecture. Our next task is: [INSERT YOUR NEXT TASK HERE]"
