# Project Bolt: Comprehensive 0-100 Architecture & Documentation

Welcome to the definitive, 100% comprehensive documentation for **Project Bolt** — a multi-tenant AI SaaS platform designed for WhatsApp and Instagram. This document explains the entire infrastructure, architecture, fixes applied, and database schemas from scratch.

---

## 1. 🌟 Platform Overview & Tech Stack
Project Bolt is a fully production-ready, enterprise-hardened multi-tenant conversational AI SaaS. It allows businesses (tenants) to connect their WhatsApp and Instagram accounts, and deploy an intelligent, Gemini-powered bot to handle leads, bookings, and customer support.

**Core Tech Stack:**
- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth + Next.js 16 Proxy Middleware (`src/middleware.ts`)
- **AI Engine:** Google Gemini 2.0 Flash (Function calling & JSON structured output)
- **Job Queue & Cache:** Redis (Upstash) & BullMQ (Standalone Node.js Worker)
- **Payments:** Razorpay Subscriptions
- **Analytics UI:** Recharts (Area, Bar, Pie charts)

---

## 2. 🗄️ Database Architecture & Tenant Isolation

The system strictly enforces **Row-Level Security (RLS)**. Every major table contains a `tenant_id` column, and Supabase RLS policies guarantee that cross-tenant data leakage is impossible at the database level. Every query must either include `.eq('tenant_id', ...)` or rely on the RLS context.

### Core Tables (`src/lib/database/schema.sql`)
1. **`tenants`**: The core business entity. Stores AI bot configuration (personality, USPs, working hours, custom FAQs), WhatsApp credentials (`wa_phone_number_id`, `wa_verify_token`), Instagram credentials, and Billing/Plan data.
2. **`users`**: Platform users (dashboard access) linked to a `tenant_id` via Supabase Auth. Includes roles (`owner`, `admin`, `staff`, `viewer`).
3. **`leads`**: End-customers messaging the WhatsApp/Instagram bot. Includes lead scoring (`new`, `hot`, `warm`, `converted`), channel source, and notes.
4. **`conversations`**: Active chat sessions. Tracks the AI's state machine (`current_step`, `escalated_at`), token usage, and extracted `context` (JSON).
5. **`messages`**: Individual inbound/outbound chat logs. Includes message status (`sent`, `delivered`, `read`) and a boolean `ai_generated` flag.
6. **`follow_ups`**: Scheduled automated messages (e.g., 30min, 3hr, 24hr). Managed and processed by BullMQ.
7. **`audit_logs`**: Compliance tracking for B2B SOC2 reporting. Tracks when users change settings, create templates, or run exports.

---

## 3. 🏗️ Core Infrastructure & Enterprise Resilience

The platform has undergone rigorous production auditing to solve Next.js 16 specific build issues and ensure robust, fault-tolerant operation at massive scale.

### A. Dedicated BullMQ Worker (`worker.ts`)
Vercel serverless functions instantly kill background threads. To solve this, all asynchronous BullMQ jobs (AI follow-ups, webhook queueing) have been extracted from Next.js completely. They run inside `worker.ts`, a persistent Node.js process deployed separately on Render/Railway.

### B. Lazy Initialization Pattern (Build-Time Crash Prevention)
In Next.js, modules are often imported during the static build phase. Eagerly initializing services using environment variables that don't exist at build time will crash the build.
- **Fix:** Proxies and getters. Never use eager `new Client()` at the module level.
- **Affected Services:** `supabaseAdmin`, `Razorpay`, and `Google GenAI`.

### C. Authentication Middleware (`src/middleware.ts`)
Next.js 16 deprecated old proxy patterns. We utilize `middleware.ts` to intercept `/dashboard` and `/admin` routes, verifying Supabase session cookies before allowing access. Unauthenticated users are safely redirected to `/login`.

### D. Security & Encryption At Rest
- **Token Cryptography:** `wa_access_token` and `ig_access_token` are encrypted at rest using Node.js `crypto` via AES-256-GCM (`src/lib/utils/crypto.ts`). Tokens are encrypted on onboarding and decrypted in server memory milliseconds before passing them to the Meta Graph API.
- **Webhook Defenses:** All incoming traffic to `/api/webhooks/*` is protected by strict IP-based rate limiting and cryptographic `x-hub-signature-256` payload verification using `META_APP_SECRET`.
- **GDPR Compliance:** The `/api/data-deletion` route performs a full cascade drop of the tenant's entire history (leads, conversations, messages, analytics, users, and the tenant record itself) honoring Article 17 "Right to Erasure".

### E. Observability, Rate Limiting & CI/CD
- **Structured Logging:** `src/lib/utils/logger.ts` intercepts logs and formats them as parsable JSON for Datadog/Axiom ingestion.
- **Health Checks:** `/api/health` continuously polls the database and Redis for uptime monitoring.
- **Serverless Rate Limiting:** All sensitive endpoints (webhooks, signup, stats, broadcast) strictly use Redis-backed rate limiting (`checkRedisRateLimit()`) to ensure true cross-invocation spam protection, rather than ephemeral in-memory maps.
- **Webhook Payload Bomb Guard:** Webhooks strictly enforce a 2MB content-length payload limit to prevent buffer explosion attacks.
- **CI/CD:** `.github/workflows/ci.yml` strictly enforces TypeScript integrity (`tsc --noEmit`), ESLint syntax, and static build validation on every PR.

### F. Scalability & Performance Optimizatons
- **Broadcast Jobs:** Broadcasts are decoupled from the Next.js API route to bypass Vercel timeouts and are processed asynchronously via BullMQ in `worker.ts`.
- **Database Caching:** `getTenantId()` aggressively caches tenant resolution in Redis (1hr TTL) to avoid blocking database queries on every authenticated API route.
- **Usage Limits:** Billing enforcement (`messages_used_this_month`) strictly bypasses the tenant cache and queries the DB directly to prevent malicious overage race conditions.
- **Token Management:** WhatsApp token revocations instantly trigger automated `Resend` email alerts to the tenant. Instagram tokens are refreshed automatically via a daily cron job.
- **Dead-Letter Alerts:** BullMQ worker `on('failed')` listeners automatically write to `analytics_events` and report to Sentry, completely eliminating silent background job failures.

---

## 4. 🧠 The AI Engine (`src/lib/ai/engine.ts`)

The AI engine uses Google Gemini 2.0 Flash to act as the conversational agent.
- **Context Injection:** Builds a dynamic system prompt injecting the tenant's USPs, Welcome Offers, Working Hours, and Custom FAQs.
- **Circuit Breaker:** Gemini API calls are wrapped in a 15,000ms `withTimeout()`. If the LLM hangs or Meta API retries overwhelm the concurrency limit, the system gracefully degrades to a deterministic structured fallback, guaranteeing 100% response reliability.
- **Token Accounting:** Every invocation calculates `totalTokenCount` and securely increments `ai_tokens_used_this_month` via Supabase RPC, allowing per-tenant API cost attribution.

---

## 5. 🔗 Webhook Pipeline & Redis Deduplication

This is the system's central nervous system (`src/app/api/webhooks/whatsapp/route.ts`).
1. **Signature & Rate Limits:** Verify Meta signature and ensure the IP isn't spamming.
2. **Redis Deduplication:** Meta often retries webhooks. We use Redis (`SETNX` with 24hr TTL) via `isDuplicateMessage` to instantly drop duplicates using the `wa_message_id`. 
3. **Tenant Resolution:** We use the incoming `wa_phone_number_id` (WhatsApp) or `ig_page_id` (Instagram) to lookup the specific tenant.
4. **AI Dispatch & Logging:** Dispatches the last 10 messages (optimized context window) to Gemini. Logs the inbound message, sends the AI's response via the Meta API (wrapped in `withRetry` logic for network resiliency), and logs the outbound message.
5. **Follow-up Scheduling:** Based on the AI's state, it pushes jobs to the BullMQ Redis queue.

---

## Conclusion
Project Bolt is a resilient, modern, enterprise-grade multi-tenant application. When extending this platform, always adhere to the established patterns: **AES-256 Token Encryption**, **Worker Isolation**, **RLS Tenant Isolation**, and **Strict TypeScript typing**.
