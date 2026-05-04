# Aries AI — Voice Agent

Python service that runs the LiveKit-based AI voice agent for inbound + outbound calls. Pairs with the Next.js dashboard via the `/api/calls/*` routes.

## Stack

- **LiveKit Cloud** — WebRTC + SIP orchestration
- **VoBiz** — Indian SIP trunk (~₹1.5/min)
- **Sarvam AI** — Indian STT (Saaras v3) + TTS (Bulbul v3)
- **Groq** — LLM (Llama 3.3 70B, free tier)
- **Cal.com / Google Calendar** — appointment booking
- **Supabase** — shared database with the Next.js app
- **FastAPI + Supervisord** — HTTP wrapper + process manager

## Files

| File | Purpose |
|---|---|
| `agent.py` | The LiveKit Agent itself (STT/LLM/TTS pipeline, tools, shutdown hook) |
| `make_call.py` | CLI + programmatic outbound dial. **Now correctly creates the SIP participant in addition to dispatching the agent.** |
| `ui_server.py` | FastAPI HTTP server the Next.js app talks to |
| `db.py` | Supabase client with retries + schema-fallback |
| `notify.py` | Telegram notifications (per-tenant aware — see below) |
| `calendar_tools.py` | Cal.com + Google Calendar booking (async-only) |
| `setup_trunk.py` | One-time VoBiz SIP trunk registration in LiveKit |
| `Dockerfile` + `supervisord.conf` | Coolify / VPS deployment |
| `configs/default.json` | Default agent personality + per-tenant overrides |
| `supabase_voice_migration.sql` | Tables + tenant-isolated RLS + voice usage columns |

## Local setup

```bash
cd voice-agent
cp .env.example .env       # fill in credentials
pip install uv
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt

# 1) One-time: register the SIP trunk in LiveKit
python setup_trunk.py
# Copy the printed ST_xxx into .env as OUTBOUND_TRUNK_ID

# 2) Apply DB migration in Supabase SQL Editor
#    voice-agent/supabase_voice_migration.sql

# 3) Run the worker
python agent.py start

# 4) In a second terminal, run the HTTP server
python ui_server.py

# 5) In a third terminal, place a test call
python make_call.py --to +91XXXXXXXXXX --name "Test User"
```

## Required environment variables

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
OUTBOUND_TRUNK_ID=ST_xxxxxxxxxx          # ← from setup_trunk.py — REQUIRED for outbound

VOBIZ_SIP_DOMAIN=xxx.sip.vobiz.ai
VOBIZ_USERNAME=...
VOBIZ_PASSWORD=...
VOBIZ_OUTBOUND_NUMBER=+91...

SARVAM_API_KEY=...
GROQ_API_KEY=...
CAL_API_KEY=...
CAL_EVENT_TYPE_ID=...

# Platform-level Telegram (ops alerts only — see "Per-tenant notifications" below)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

SUPABASE_URL=...
SUPABASE_KEY=...                          # service-role key — bypasses RLS

VOICE_SERVER_PORT=8080
VOICE_SERVER_CORS_ORIGINS=https://your-dashboard.com
```

## Per-tenant configuration

Each Aries AI customer can have a custom agent personality. Drop a file at:

```
voice-agent/configs/tenant_<TENANT_ID>.json
```

The agent loads it at the start of each call (falls back to `default.json`).

### Supported keys

| Key | Type | Notes |
|---|---|---|
| `agent_instructions` | string | The system prompt (most important) |
| `first_line` | string | Exact greeting Aria says on pickup |
| `business_name` | string | Used in greeting fallback |
| `lang_preset` | enum | `hindi` / `english` / `tamil` / `telugu` / `multilingual` |
| `tts_voice` | string | Sarvam voice — `kavya`, `priya`, `dev`, etc. |
| `tts_language` | string | BCP-47 — `hi-IN`, `en-IN`, etc. |
| `tts_provider` | enum | `sarvam` (default) |
| `stt_provider` | enum | `sarvam` (default) |
| `llm_model` | string | e.g. `llama-3.3-70b-versatile` |
| `llm_provider` | enum | `groq` / `claude` / `openai` |
| `max_turns` | int | Hard cap on conversation turns (default 25) |
| `stt_min_endpointing_delay` | float | Seconds of silence before reply (default 0.2) |
| `telegram_chat_id` | string | **Per-tenant Telegram chat for booking notifications.** Empty falls back to the platform-level `TELEGRAM_CHAT_ID` (ops only). |

### Security note on tenant configs

Tenant config files **cannot override platform secrets** (LiveKit / Groq / Sarvam / Supabase API keys). Earlier versions of `agent.py` allowed this via `os.environ` mutation; that path was removed for tenant-isolation reasons.

## Per-tenant notifications

Booking confirmations are routed to the Telegram chat whose ID lives in the tenant's config (`telegram_chat_id`). The platform-level `TELEGRAM_CHAT_ID` env var is a fallback for ops alerts (e.g. agent errors during a call).

To set up notifications for a customer:

1. They (or you) message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Reuse one shared bot token (`TELEGRAM_BOT_TOKEN`) — this is per platform, not per tenant
3. The tenant gets their chat ID from [@userinfobot](https://t.me/userinfobot)
4. Save it into `configs/tenant_<id>.json` as `"telegram_chat_id": "..."`

## Architecture

```
Phone → VoBiz SIP → LiveKit Cloud → agent.py (Sarvam STT → Groq LLM → Sarvam TTS)
                                       ↓
                               Cal.com / GCal API (booking)
                                       ↓
                               Supabase (call_logs, transcripts)
                                       ↓
                               ui_server.py (FastAPI :8080)
                                       ↓
                               Next.js dashboard /dashboard/voice
```

## Cost reference (per minute)

| Service | Cost |
|---|---|
| VoBiz SIP | ~₹1.5/min |
| Sarvam STT | ~₹0.06/min |
| Sarvam TTS | ~₹0.08/min |
| Groq LLM | Free tier (rate-limited) |
| LiveKit | Free up to 100k min/mo |
| **Total** | **~₹2-3/min** at small scale, **~₹3-5/min** with Groq paid plan |

vs Vapi: ~₹20-25/min.

## Known operational gotchas

- **Groq free-tier rate limits** kick in around 30 req/min. At scale, switch to a paid Groq plan or fall back to OpenAI via `llm_provider`.
- **VoBiz is a single point of failure** for Indian outbound. Have a Plivo or Twilio India fallback ready before going to scale.
- **DPDP Act 2023** — calls are recorded and transcribed. Add explicit consent in the opening line for production deployments.
- **`OUTBOUND_TRUNK_ID` is required** — without it, `make_call.py` returns a clear error instead of dialing into the void.
