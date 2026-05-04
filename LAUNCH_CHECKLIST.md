# 🚀 Launch Checklist — Aries AI + Libra AI

**Target launch window:** May 12–15, 2026
**Owner:** Sakshay
**Last updated:** May 5, 2026

This is the single source of truth for what's left to launch. Code changes are mostly done; the rest is **infrastructure setup, content, and external accounts**. Work top-to-bottom.

---

## Legend
- 🔴 **Blocker** — launch impossible without this
- 🟡 **Important** — should ship at launch but workaround exists
- 🟢 **Nice to have** — can ship after launch

---

## 1. External accounts you must create (manual)

| # | Service | Purpose | Notes | Status |
|---|---|---|---|---|
| 1.1 | 🔴 **Supabase** | DB + Auth | Already exists if you can log in to dashboard | ☐ |
| 1.2 | 🔴 **Vercel** | Web app hosting | Already deployed if `ariesai.in` resolves | ☐ |
| 1.3 | 🔴 **Upstash Redis** | Rate limit + cache + BullMQ queue | Free tier OK to launch | ☐ |
| 1.4 | 🔴 **Meta Developer** | WhatsApp Cloud API + Instagram Messaging | App must be in Live mode (not Dev) | ☐ |
| 1.5 | 🔴 **Razorpay** | Subscription billing | KYC must be **fully approved** for live mode | ☐ |
| 1.6 | 🔴 **Resend** | Transactional email | Verify your sending domains: `ariesai.in`, `libraai.in` | ☐ |
| 1.7 | 🔴 **Domain — `ariesai.in`** | Aries landing | Point CNAME to Vercel | ☐ |
| 1.8 | 🔴 **Domain — `libraai.in`** | Libra landing | Point CNAME to Vercel; add as alias domain in same Vercel project | ☐ |
| 1.9 | 🟡 **Sentry** | Error monitoring | Create org `aries-ai`, project `aries-libra-platform` | ☐ |
| 1.10 | 🟡 **LiveKit Cloud** | Voice agent realtime transport | Only needed if launching voice with Aries | ☐ |
| 1.11 | 🟡 **VoBiz** (or alt SIP) | Indian outbound calling | Only for voice agent | ☐ |
| 1.12 | 🟡 **Sarvam AI** | STT/TTS for Indian languages | Voice agent only | ☐ |
| 1.13 | 🟡 **Groq** | Fast LLM for voice | Voice agent only | ☐ |
| 1.14 | 🟡 **Cal.com** | Booking integration | Voice agent calendar tools | ☐ |
| 1.15 | 🟡 **Telegram BotFather** | Per-tenant call notifications | Voice agent only | ☐ |
| 1.16 | 🟢 **Coolify / Hetzner VPS** | Voice-agent Docker host | Voice agent only | ☐ |
| 1.17 | 🟢 **Render / Railway / Fly.io** | BullMQ worker (`worker.ts`) | If you don't run worker, follow-ups won't fire | 🔴 |

> **Heads-up on 1.17:** The BullMQ worker is a *blocker*, not nice-to-have. Without it, follow-ups, broadcasts, and webhook back-pressure all break.

---

## 2. Database setup (Supabase SQL Editor)

Run **in order**, top to bottom:

1. 🔴 `src/lib/database/schema.sql` — base schema (skip if already run; check by querying `\d tenants`)
2. 🔴 `src/lib/database/migrations/2026_05_05_brand_split.sql` — adds `brand` column for Aries/Libra split (**new — must run before launch**)
3. 🟡 `voice-agent/supabase_voice_migration.sql` — only if launching voice features

**Verify after running:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tenants' AND column_name = 'brand';
-- should return 1 row
```

---

## 3. Environment variables (Vercel → Settings → Environment Variables)

Copy these from `.env.example` and fill real values. **All required for production unless noted.**

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` 🔒

### Meta (WhatsApp + Instagram)
- `META_APP_SECRET` 🔒
- `META_VERIFY_TOKEN` (used for webhook subscription handshake)
- `WHATSAPP_API_VERSION` (e.g. `v22.0`)

### AI
- `GEMINI_API_KEY` 🔒

### Redis / Worker
- `UPSTASH_REDIS_URL` 🔒
- `WORKER_URL` (e.g. `https://your-worker.onrender.com` — used by `next.config.ts` rewrites for Bull-Board)

### Crypto
- `TOKEN_ENCRYPTION_KEY` 🔒 — **must be a 32-byte hex string**. Generate once with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  **Never rotate without re-encrypting all tenant tokens.**

### Razorpay
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET` 🔒
- `RAZORPAY_WEBHOOK_SECRET` 🔒

### Email
- `RESEND_API_KEY` 🔒
- `RESEND_FROM_ARIES` (e.g. `Aries AI <hello@ariesai.in>`)
- `RESEND_FROM_LIBRA` (e.g. `Libra AI <hello@libraai.in>`)

### Sentry (optional)
- `SENTRY_DSN` 🔒
- `SENTRY_ORG` (default `aries-ai`)
- `SENTRY_PROJECT` (default `aries-libra-platform`)
- `SENTRY_AUTH_TOKEN` 🔒 (only for sourcemap upload in CI)

### Voice agent (only if launching voice)
- `VOICE_AGENT_SERVER_URL` (e.g. `https://voice.ariesai.in`)

🔒 = secret, never expose to client. Anything starting with `NEXT_PUBLIC_` IS exposed to the browser by design — never put a secret behind that prefix.

---

## 4. Domain & DNS

| Domain | Record | Value | Purpose |
|---|---|---|---|
| `ariesai.in` | A / CNAME | Vercel target | Aries landing |
| `www.ariesai.in` | CNAME | `cname.vercel-dns.com` | redirect → apex |
| `libraai.in` | A / CNAME | Vercel target | Libra landing (rewritten by `proxy.ts`) |
| `www.libraai.in` | CNAME | `cname.vercel-dns.com` | redirect → apex |
| `voice.ariesai.in` | A | VPS IP | Voice agent (optional) |

**In Vercel:** add both `ariesai.in` and `libraai.in` as domains on the **same project**. The host-based rewrite in `src/proxy.ts` does the rest.

---

## 5. Meta app setup (WhatsApp + Instagram)

### App-level
- 🔴 App is **Live**, not in Development.
- 🔴 **App Secret** matches `META_APP_SECRET` env var.
- 🔴 Webhook URL set to `https://ariesai.in/api/webhooks/whatsapp` (Aries) and `https://ariesai.in/api/webhooks/instagram` (Libra reuses same backend).
- 🔴 Verify token matches `META_VERIFY_TOKEN`.

### WhatsApp Cloud API
- Subscribe to fields: `messages`, `message_template_status_update`.
- Tenant onboarding flow stores phone number ID via `/api/whatsapp/connect`.

### Instagram Messaging
- Test with a Business / Creator account first.
- Subscribe to: `messages`, `messaging_postbacks`, `comments` (for Libra reel-comment automation later).

---

## 6. Razorpay plans

Create **one Razorpay Plan per (brand × tier)** combination in Razorpay dashboard, then store IDs in DB.

Suggested initial plans (all monthly):

### Aries (WhatsApp)
- `aries_starter` — ₹999
- `aries_growth` — ₹2,499
- `aries_pro` — ₹6,999
- `aries_enterprise` — custom

### Libra (Instagram)
- `libra_starter` — ₹999
- `libra_growth` — ₹2,499
- `libra_pro` — ₹6,999

Tag the plan IDs with brand so the dashboard billing page only shows the right ones.

🔴 Razorpay webhook URL: `https://ariesai.in/api/billing/webhook` (or wherever it lives).

---

## 7. Code-side launch checks

Run all of these locally **before pushing the launch tag**:

```bash
# Type-strict build
npm run build

# Tests
npm test

# Lint
npm run lint
```

CI (`.github/workflows/ci.yml`) enforces all three on every PR — green badge = ship.

---

## 8. Voice agent launch (only if shipping voice with Aries)

1. ☐ Run `python voice-agent/setup_trunk.py` once.
2. ☐ Paste the printed `ST_xxx` into `voice-agent/.env` as `OUTBOUND_TRUNK_ID`.
3. ☐ Run `voice-agent/supabase_voice_migration.sql` in Supabase.
4. ☐ Set tenant plans to `pro` or `ultra_premium`; configure `voice_call_limit` (Ultra = 150).
5. ☐ Build + deploy `voice-agent/` Docker image to Coolify or VPS.
6. ☐ Set `VOICE_AGENT_SERVER_URL` in Vercel env.
7. ☐ For per-tenant Telegram alerts, drop `voice-agent/configs/tenant_<TENANT_ID>.json` with `telegram_chat_id`.

---

## 9. Pre-launch smoke test (do all 8 in one sitting)

1. ☐ Visit `https://ariesai.in` → Aries landing renders.
2. ☐ Visit `https://libraai.in` → Libra landing renders (different colors, copy).
3. ☐ Sign up from `libraai.in/signup` → tenant row in DB has `brand = 'libra'`.
4. ☐ Sign up from `ariesai.in/signup` → tenant row has `brand = 'aries'`.
5. ☐ WhatsApp test message to your test number → AI replies in <5s.
6. ☐ Instagram DM to your test account → AI replies in <5s.
7. ☐ Razorpay live-mode test purchase → `plan_status` flips to `active`.
8. ☐ Sentry receives a deliberately-thrown test error.

---

## 10. Post-launch (first 48 hours)

- 🟢 Monitor `/api/health` every 60s (Better Stack, BetterUptime, or UptimeRobot)
- 🟢 Watch Sentry for unhandled errors — fix anything crashing >1% of requests
- 🟢 Check Razorpay subscriptions activate cleanly
- 🟢 Watch BullMQ queue depth at `worker.onrender.com/admin/queue`
- 🟢 Reply to first 10 customer support emails personally (high-touch onboarding)

---

## What's already DONE in code (for your awareness)

- ✅ Multi-brand architecture: `src/lib/brand.ts`, `proxy.ts` host detection, brand attribution on signup
- ✅ Aries landing (`src/app/page.tsx`) + Libra landing (`src/app/libra/page.tsx`)
- ✅ DB migration for `brand` column (`src/lib/database/migrations/2026_05_05_brand_split.sql`)
- ✅ Full WhatsApp + Instagram webhook pipelines with Meta signature verification, Redis dedup, rate limits
- ✅ Gemini 2.0 Flash AI engine with circuit breaker + deterministic fallback
- ✅ AES-256-GCM token encryption at rest (`src/lib/utils/crypto.ts`)
- ✅ Multi-tenant RLS, Razorpay subscriptions, Resend email, Sentry, BullMQ worker
- ✅ Voice agent (LiveKit + Sarvam + Groq) — code complete, awaiting infra
- ✅ Tests: crypto, webhook signature, tenant config — all green in CI
