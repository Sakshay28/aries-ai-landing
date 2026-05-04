import os
import json
import logging
import certifi
import pytz
import re
import asyncio
import time
from collections import defaultdict
from datetime import datetime, timedelta
from dotenv import load_dotenv
from typing import Annotated

os.environ["SSL_CERT_FILE"] = certifi.where()

import sentry_sdk
_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    from sentry_sdk.integrations.asyncio import AsyncioIntegration
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1,
                    integrations=[AsyncioIntegration()],
                    environment=os.environ.get("ENVIRONMENT", "production"))

logging.getLogger("hpack").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

load_dotenv()
logger = logging.getLogger("aries-voice-agent")
logging.basicConfig(level=logging.INFO)

from livekit import api
from livekit.agents import (Agent, AgentSession, JobContext,
                             RoomInputOptions, WorkerOptions, cli, llm)
from livekit.plugins import openai, sarvam, silero

import db

CONFIG_FILE = "config.json"

# ── Rate limiting ──────────────────────────────────────────────────────────────
_call_timestamps: dict = defaultdict(list)
RATE_LIMIT_CALLS  = 5
RATE_LIMIT_WINDOW = 3600

def is_rate_limited(phone: str) -> bool:
    if phone in ("unknown", "demo"): return False
    now = time.time()
    _call_timestamps[phone] = [t for t in _call_timestamps[phone] if now - t < RATE_LIMIT_WINDOW]
    if len(_call_timestamps[phone]) >= RATE_LIMIT_CALLS: return True
    _call_timestamps[phone].append(now)
    return False

# ── Config loader — tries per-tenant file first ────────────────────────────────
def get_live_config(tenant_id: str | None = None, phone_number: str | None = None):
    config = {}
    paths = []
    # Per-tenant config takes highest priority
    if tenant_id:
        paths.append(f"configs/tenant_{tenant_id}.json")
    # Per-phone fallback (inbound caller ID)
    if phone_number and phone_number != "unknown":
        clean = phone_number.replace("+", "").replace(" ", "")
        paths.append(f"configs/{clean}.json")
    paths += ["configs/default.json", CONFIG_FILE]

    for path in paths:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    config = json.load(f)
                    logger.info(f"[CONFIG] Loaded: {path}")
                    break
            except Exception as e:
                logger.error(f"[CONFIG] Failed to read {path}: {e}")

    return {
        "agent_instructions":        config.get("agent_instructions", ""),
        "stt_min_endpointing_delay": config.get("stt_min_endpointing_delay", 0.2),
        "llm_model":                 config.get("llm_model", "llama-3.3-70b-versatile"),
        "llm_provider":              config.get("llm_provider", "groq"),
        "tts_voice":                 config.get("tts_voice", "kavya"),
        "tts_language":              config.get("tts_language", "hi-IN"),
        "tts_provider":              config.get("tts_provider", "sarvam"),
        "stt_provider":              config.get("stt_provider", "sarvam"),
        "stt_language":              config.get("stt_language", "unknown"),
        "lang_preset":               config.get("lang_preset", "multilingual"),
        "max_turns":                 config.get("max_turns", 25),
        "tenant_id":                 config.get("tenant_id", tenant_id or ""),
        "business_name":             config.get("business_name", "Aries AI"),
        **config,
    }

# ── Token counter ──────────────────────────────────────────────────────────────
def count_tokens(text: str) -> int:
    try:
        import tiktoken
        enc = tiktoken.encoding_for_model("gpt-4o")
        return len(enc.encode(text))
    except Exception:
        return len(text.split())

# ── IST time context ───────────────────────────────────────────────────────────
def get_ist_time_context() -> str:
    ist = pytz.timezone("Asia/Kolkata")
    now = datetime.now(ist)
    today_str = now.strftime("%A, %B %d, %Y")
    time_str  = now.strftime("%I:%M %p")
    days_lines = []
    for i in range(7):
        day   = now + timedelta(days=i)
        label = "Today" if i == 0 else ("Tomorrow" if i == 1 else day.strftime("%A"))
        days_lines.append(f"  {label}: {day.strftime('%A %d %B %Y')} → ISO {day.strftime('%Y-%m-%d')}")
    days_block = "\n".join(days_lines)
    return (
        f"\n\n[SYSTEM CONTEXT]\n"
        f"Current date & time: {today_str} at {time_str} IST\n"
        f"Resolve ALL relative day references using this table:\n{days_block}\n"
        f"Always use ISO dates when calling save_booking_intent. Appointments in IST (+05:30).]"
    )

# ── Language presets ───────────────────────────────────────────────────────────
LANGUAGE_PRESETS = {
    "hinglish":    {"tts_language": "hi-IN", "tts_voice": "kavya",  "instruction": "Speak in natural Hinglish — mix Hindi and English like educated Indians do."},
    "hindi":       {"tts_language": "hi-IN", "tts_voice": "ritu",   "instruction": "Speak only in pure Hindi."},
    "english":     {"tts_language": "en-IN", "tts_voice": "dev",    "instruction": "Speak only in Indian English with a warm, professional tone."},
    "tamil":       {"tts_language": "ta-IN", "tts_voice": "priya",  "instruction": "Speak only in Tamil."},
    "telugu":      {"tts_language": "te-IN", "tts_voice": "kavya",  "instruction": "Speak only in Telugu."},
    "multilingual":{"tts_language": "hi-IN", "tts_voice": "kavya",  "instruction": "Detect the caller's language from their first message and reply in that SAME language for the entire call."},
}

def get_language_instruction(lang_preset: str) -> str:
    preset = LANGUAGE_PRESETS.get(lang_preset, LANGUAGE_PRESETS["multilingual"])
    return f"\n\n[LANGUAGE DIRECTIVE]\n{preset['instruction']}"

from calendar_tools import get_available_slots, async_create_booking, async_cancel_booking
from notify import (notify_booking_confirmed, notify_booking_cancelled,
                    notify_call_no_booking, notify_agent_error)

# ═══════════════════════════════════════════════════════════════════════════════
class AgentTools(llm.ToolContext):

    def __init__(self, caller_phone: str, caller_name: str = "", tenant_id: str = ""):
        super().__init__(tools=[])
        self.caller_phone   = caller_phone
        self.caller_name    = caller_name
        self.tenant_id      = tenant_id
        self.booking_intent: dict | None = None
        self.sip_domain     = os.getenv("VOBIZ_SIP_DOMAIN")
        self.ctx_api        = None
        self.room_name      = None
        self._sip_identity  = None

    @llm.function_tool(description="Transfer this call to a human agent. Use if caller asks for human, is angry, or query is outside scope.")
    async def transfer_call(self) -> str:
        logger.info("[TOOL] transfer_call triggered")
        destination = os.getenv("DEFAULT_TRANSFER_NUMBER")
        if destination and self.sip_domain and "@" not in destination:
            clean_dest  = destination.replace("tel:", "").replace("sip:", "")
            destination = f"sip:{clean_dest}@{self.sip_domain}"
        if destination and not destination.startswith("sip:"):
            destination = f"sip:{destination}"
        try:
            if self.ctx_api and self.room_name and destination and self._sip_identity:
                await self.ctx_api.sip.transfer_sip_participant(
                    api.TransferSIPParticipantRequest(
                        room_name=self.room_name,
                        participant_identity=self._sip_identity,
                        transfer_to=destination,
                        play_dialtone=False,
                    ))
                return "Transfer initiated successfully."
            return "Unable to transfer right now."
        except Exception as e:
            logger.error(f"Transfer failed: {e}")
            return "Unable to transfer right now."

    @llm.function_tool(description="End the call. Use ONLY when caller says bye/goodbye or after booking is fully confirmed.")
    async def end_call(self) -> str:
        logger.info("[TOOL] end_call triggered — hanging up.")
        try:
            if self.ctx_api and self.room_name and self._sip_identity:
                await self.ctx_api.sip.transfer_sip_participant(
                    api.TransferSIPParticipantRequest(
                        room_name=self.room_name,
                        participant_identity=self._sip_identity,
                        transfer_to="tel:+00000000",
                        play_dialtone=False,
                    ))
        except Exception as e:
            logger.warning(f"[END-CALL] SIP hangup failed: {e}")
        return "Call ended."

    @llm.function_tool(description="Save booking intent after caller confirms appointment. Call this ONCE after you have name, phone, email, date, time.")
    async def save_booking_intent(
        self,
        start_time:   Annotated[str, "ISO 8601 datetime e.g. '2026-03-01T10:00:00+05:30'"],
        caller_name:  Annotated[str, "Full name of the caller"],
        caller_phone: Annotated[str, "Phone number of the caller"],
        notes:        Annotated[str, "Any notes, email, or special requests"] = "",
    ) -> str:
        logger.info(f"[TOOL] save_booking_intent: {caller_name} at {start_time}")
        self.booking_intent = {
            "start_time":   start_time,
            "caller_name":  caller_name,
            "caller_phone": caller_phone,
            "notes":        notes,
        }
        self.caller_name = caller_name
        return f"Booking intent saved for {caller_name} at {start_time}. I'll confirm after the call."

    @llm.function_tool(description="Check available appointment slots for a given date.")
    async def check_availability(
        self,
        date: Annotated[str, "Date in YYYY-MM-DD format"],
    ) -> str:
        logger.info(f"[TOOL] check_availability: date={date}")
        try:
            slots = await get_available_slots(date)
            if not slots:
                return f"No available slots on {date}. Would you like to check another date?"
            slot_strings = [s.get("label", str(s))[:5] for s in slots[:6]]
            return f"Available slots on {date}: {', '.join(slot_strings)} IST."
        except Exception as e:
            logger.error(f"[TOOL] check_availability failed: {e}")
            return "I'm having trouble checking the calendar right now."

    @llm.function_tool(description="Check if the business is currently open.")
    async def get_business_hours(self) -> str:
        ist  = pytz.timezone("Asia/Kolkata")
        now  = datetime.now(ist)
        hours = {0:("Monday","10:00","19:00"),1:("Tuesday","10:00","19:00"),
                 2:("Wednesday","10:00","19:00"),3:("Thursday","10:00","19:00"),
                 4:("Friday","10:00","19:00"),5:("Saturday","10:00","17:00"),
                 6:("Sunday",None,None)}
        day_name, open_t, close_t = hours[now.weekday()]
        current_time = now.strftime("%H:%M")
        if open_t is None:
            return "We are closed on Sundays. Next opening: Monday 10:00 AM IST."
        if open_t <= current_time <= close_t:
            return f"We are OPEN. Today ({day_name}): {open_t}–{close_t} IST."
        return f"We are CLOSED. Today ({day_name}): {open_t}–{close_t} IST."

# ═══════════════════════════════════════════════════════════════════════════════
class OutboundAssistant(Agent):

    def __init__(self, agent_tools: AgentTools, live_config: dict | None = None):
        tools = llm.find_function_tools(agent_tools)
        self._live_config = live_config or {}
        base_instructions  = self._live_config.get("agent_instructions", "")
        ist_context        = get_ist_time_context()
        lang_preset        = self._live_config.get("lang_preset", "multilingual")
        lang_instruction   = get_language_instruction(lang_preset)
        final_instructions = base_instructions + ist_context + lang_instruction
        token_count = count_tokens(final_instructions)
        logger.info(f"[PROMPT] System prompt: {token_count} tokens")
        super().__init__(instructions=final_instructions, tools=tools)

    async def on_enter(self):
        business_name = self._live_config.get("business_name", "Aries AI")
        greeting = self._live_config.get(
            "first_line",
            f"Namaste! This is Aria from {business_name}. How can I help you today?"
        )
        await self.session.generate_reply(instructions=f"Say exactly this phrase: '{greeting}'")

agent_is_speaking = False

# ═══════════════════════════════════════════════════════════════════════════════
async def entrypoint(ctx: JobContext):
    global agent_is_speaking
    await ctx.connect()
    logger.info(f"[ROOM] Connected: {ctx.room.name}")

    phone_number = None
    caller_name  = ""
    tenant_id    = ""

    # Extract metadata (outbound dispatch passes phone + tenant_id)
    metadata = ctx.job.metadata or ""
    if metadata:
        try:
            meta      = json.loads(metadata)
            phone_number = meta.get("phone_number")
            tenant_id = meta.get("tenant_id", "")
        except Exception:
            pass

    # Extract from SIP participants (inbound)
    for identity, participant in ctx.room.remote_participants.items():
        if participant.name and participant.name not in ("", "Caller", "Unknown"):
            caller_name = participant.name
        if not phone_number:
            attr = participant.attributes or {}
            phone_number = attr.get("sip.phoneNumber") or attr.get("phoneNumber")
        if not phone_number and "+" in identity:
            m = re.search(r"\+\d{7,15}", identity)
            if m: phone_number = m.group()

    caller_phone = phone_number or "unknown"

    if is_rate_limited(caller_phone):
        logger.warning(f"[RATE-LIMIT] Blocked {caller_phone}")
        return

    live_config   = get_live_config(tenant_id=tenant_id or None, phone_number=caller_phone)
    delay_setting = live_config.get("stt_min_endpointing_delay", 0.2)
    llm_model     = live_config.get("llm_model", "llama-3.3-70b-versatile")
    llm_provider  = live_config.get("llm_provider", "groq")
    tts_voice     = live_config.get("tts_voice", "kavya")
    tts_language  = live_config.get("tts_language", "hi-IN")
    tts_provider  = live_config.get("tts_provider", "sarvam")
    stt_provider  = live_config.get("stt_provider", "sarvam")
    stt_language  = live_config.get("stt_language", "unknown")
    max_turns     = live_config.get("max_turns", 25)
    # Per-tenant Telegram chat for booking notifications. Empty falls back to
    # the platform-level TELEGRAM_CHAT_ID (ops alerts only).
    tenant_telegram_chat_id = str(live_config.get("telegram_chat_id", "") or "")

    # SECURITY: Tenant configs MUST NOT override platform secrets at runtime.
    # The previous code allowed any per-tenant config file to silently swap our
    # LiveKit/Groq/Sarvam/Supabase keys via os.environ mutation, opening a path
    # for a malicious tenant config to redirect audio + data to a different
    # account. Secrets are now strictly platform-level (.env on the host).
    #
    # Per-tenant overrides (voice, language, instructions, business_name, etc.)
    # are still respected via `live_config` lookups elsewhere in this function.

    # Caller memory from Supabase
    async def get_caller_history(phone: str) -> str:
        if phone == "unknown": return ""
        try:
            sb = db.get_supabase()
            if not sb: return ""
            result = (sb.table("call_logs")
                        .select("summary, created_at")
                        .eq("phone_number", phone)
                        .order("created_at", desc=True)
                        .limit(1).execute())
            if result.data:
                last = result.data[0]
                return f"\n\n[CALLER HISTORY: Last call {last['created_at'][:10]}. Summary: {last['summary']}]"
        except Exception as e:
            logger.warning(f"[MEMORY] Could not load history: {e}")
        return ""

    caller_history = await get_caller_history(caller_phone)
    if caller_history:
        live_config["agent_instructions"] = live_config.get("agent_instructions","") + caller_history

    agent_tools = AgentTools(caller_phone=caller_phone, caller_name=caller_name, tenant_id=tenant_id)
    agent_tools._sip_identity = f"sip_{caller_phone.replace('+','')}" if phone_number else "inbound_caller"
    agent_tools.ctx_api   = ctx.api
    agent_tools.room_name = ctx.room.name

    # ── LLM selection ─────────────────────────────────────────────────────────
    if llm_provider == "groq":
        agent_llm = openai.LLM.with_groq(model=llm_model or "llama-3.3-70b-versatile", max_completion_tokens=120)
        logger.info(f"[LLM] Using Groq: {llm_model}")
    elif llm_provider == "claude":
        agent_llm = openai.LLM(
            model=llm_model or "claude-haiku-3-5-latest",
            base_url="https://api.anthropic.com/v1/",
            api_key=os.environ.get("ANTHROPIC_API_KEY",""),
            max_completion_tokens=120)
        logger.info(f"[LLM] Using Claude: {llm_model}")
    else:
        agent_llm = openai.LLM(model=llm_model, max_completion_tokens=120)
        logger.info(f"[LLM] Using OpenAI: {llm_model}")

    # ── STT ───────────────────────────────────────────────────────────────────
    agent_stt = sarvam.STT(language=stt_language, model="saaras:v3",
                            mode="translate", flush_signal=True, sample_rate=16000)
    logger.info("[STT] Using Sarvam Saaras v3")

    # ── TTS ───────────────────────────────────────────────────────────────────
    agent_tts = sarvam.TTS(target_language_code=tts_language, model="bulbul:v3",
                            speaker=tts_voice, speech_sample_rate=24000)
    logger.info(f"[TTS] Using Sarvam Bulbul v3 — voice: {tts_voice} lang: {tts_language}")

    turn_count    = 0
    interrupt_count = 0

    agent = OutboundAssistant(agent_tools=agent_tools, live_config=live_config)

    # Noise cancellation (optional)
    try:
        from livekit.agents import noise_cancellation as nc
        _noise_cancel = nc.BVC()
        logger.info("[AUDIO] BVC noise cancellation enabled")
    except Exception:
        _noise_cancel = None

    room_input = RoomInputOptions(close_on_disconnect=False)
    if _noise_cancel:
        try:
            room_input = RoomInputOptions(close_on_disconnect=False, noise_cancellation=_noise_cancel)
        except Exception:
            room_input = RoomInputOptions(close_on_disconnect=False)

    session = AgentSession(
        stt=agent_stt, llm=agent_llm, tts=agent_tts,
        turn_detection="stt",
        min_endpointing_delay=float(delay_setting),
        allow_interruptions=True,
    )

    await session.start(room=ctx.room, agent=agent, room_input_options=room_input)

    try:
        await session.tts.prewarm()
        logger.info("[TTS] Pre-warmed")
    except Exception as e:
        logger.debug(f"[TTS] Pre-warm skipped: {e}")

    logger.info("[AGENT] Session live — waiting for caller audio.")
    call_start_time = datetime.now()

    # ── Upsert active_calls ───────────────────────────────────────────────────
    async def upsert_active_call(status: str):
        try:
            sb = db.get_supabase()
            if sb:
                sb.table("active_calls").upsert({
                    "room_id":     ctx.room.name,
                    "phone":       caller_phone,
                    "caller_name": caller_name,
                    "status":      status,
                    "last_updated": datetime.utcnow().isoformat(),
                }).execute()
        except Exception as e:
            logger.debug(f"[ACTIVE-CALL] {e}")

    await upsert_active_call("active")

    # ── Real-time transcript streaming ────────────────────────────────────────
    async def _log_transcript(role: str, content: str):
        try:
            sb = db.get_supabase()
            if sb:
                sb.table("call_transcripts").insert({
                    "call_room_id": ctx.room.name,
                    "phone":        caller_phone,
                    "role":         role,
                    "content":      content,
                }).execute()
        except Exception as e:
            logger.debug(f"[TRANSCRIPT-STREAM] {e}")

    @session.on("agent_speech_started")
    def _agent_speech_started(ev):
        global agent_is_speaking
        agent_is_speaking = True

    @session.on("agent_speech_finished")
    def _agent_speech_finished(ev):
        global agent_is_speaking
        agent_is_speaking = False

    @session.on("agent_speech_interrupted")
    def _on_interrupted(ev):
        nonlocal interrupt_count
        interrupt_count += 1

    FILLER_WORDS = {"okay.","okay","ok","uh","hmm","hm","yeah","yes","no","um","ah",
                    "oh","right","sure","fine","good","haan","han","theek","theek hai","accha","ji","ha"}

    @session.on("user_speech_committed")
    def on_user_speech_committed(ev):
        nonlocal turn_count
        global agent_is_speaking
        transcript = ev.user_transcript.strip()
        transcript_lower = transcript.lower().rstrip(".")
        if agent_is_speaking or not transcript or len(transcript) < 3: return
        if transcript_lower in FILLER_WORDS: return
        asyncio.create_task(_log_transcript("user", transcript))
        turn_count += 1
        logger.info(f"[TRANSCRIPT] Turn {turn_count}/{max_turns}: '{transcript}'")
        if turn_count >= max_turns:
            asyncio.create_task(session.generate_reply(
                instructions="Politely wrap up: thank the caller and say a warm goodbye."))

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        global agent_is_speaking
        agent_is_speaking = False
        asyncio.create_task(unified_shutdown_hook(ctx))

    # ═══════════════════════════════════════════════════════════════════════════
    # POST-CALL SHUTDOWN HOOK
    # ═══════════════════════════════════════════════════════════════════════════
    async def unified_shutdown_hook(shutdown_ctx: JobContext):
        logger.info("[SHUTDOWN] Sequence started.")
        duration = int((datetime.now() - call_start_time).total_seconds())

        booking_status_msg = "No booking"
        if agent_tools.booking_intent:
            from calendar_tools import async_create_booking
            intent = agent_tools.booking_intent
            result = await async_create_booking(
                start_time=intent["start_time"], caller_name=intent["caller_name"] or "Unknown Caller",
                caller_phone=intent["caller_phone"], notes=intent["notes"])
            if result.get("success"):
                notify_booking_confirmed(
                    caller_name=intent["caller_name"], caller_phone=intent["caller_phone"],
                    booking_time_iso=intent["start_time"], booking_id=result.get("booking_id"),
                    notes=intent["notes"], tts_voice=tts_voice, ai_summary="",
                    tenant_chat_id=tenant_telegram_chat_id)
                booking_status_msg = f"Booking Confirmed: {result.get('booking_id')}"
            else:
                booking_status_msg = f"Booking Failed: {result.get('message')}"
        else:
            notify_call_no_booking(
                caller_name=agent_tools.caller_name, caller_phone=agent_tools.caller_phone,
                call_summary="Caller did not schedule during this call.",
                tts_voice=tts_voice, duration_seconds=duration,
                tenant_chat_id=tenant_telegram_chat_id)

        # Build transcript
        transcript_text = ""
        try:
            messages = agent.chat_ctx.messages
            if callable(messages): messages = messages()
            lines = []
            for msg in messages:
                if getattr(msg, "role", None) in ("user", "assistant"):
                    content = getattr(msg, "content", "")
                    if isinstance(content, list):
                        content = " ".join(str(c) for c in content if isinstance(c, str))
                    lines.append(f"[{msg.role.upper()}] {content}")
            transcript_text = "\n".join(lines)
        except Exception as e:
            logger.error(f"[SHUTDOWN] Transcript read failed: {e}")
            transcript_text = "unavailable"

        # Cost estimation
        def estimate_cost(dur: int, chars: int) -> float:
            return round((dur/60)*0.002 + (dur/60)*0.006 + (chars/1000)*0.003 + (chars/4000)*0.0001, 5)
        estimated_cost = estimate_cost(duration, len(transcript_text))
        logger.info(f"[COST] Estimated: ${estimated_cost}")

        ist = pytz.timezone("Asia/Kolkata")
        call_dt = call_start_time.astimezone(ist)

        await upsert_active_call("completed")

        from db import save_call_log
        save_call_log(
            phone=caller_phone, duration=duration, transcript=transcript_text,
            summary=booking_status_msg, caller_name=agent_tools.caller_name or "",
            estimated_cost_usd=estimated_cost,
            call_date=call_dt.date().isoformat(), call_hour=call_dt.hour,
            call_day_of_week=call_dt.strftime("%A"),
            was_booked=bool(agent_tools.booking_intent),
            interrupt_count=interrupt_count,
            tenant_id=tenant_id,
        )

    ctx.add_shutdown_callback(unified_shutdown_hook)

# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="outbound-caller"))
