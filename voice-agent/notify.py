import os
import logging
import requests
import httpx
from datetime import datetime

logger = logging.getLogger("notify")

# Platform-level Telegram bot token (one bot, many chats).
# The CHAT ID per call is resolved from per-tenant config first; the global
# TELEGRAM_CHAT_ID env var is only an ops-level fallback for the platform owner.
PLATFORM_TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
PLATFORM_TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")


def send_telegram(message: str, chat_id: str = "", bot_token: str = "") -> bool:
    """Send a Telegram message.

    `chat_id` — pass the tenant's chat_id for per-tenant routing. Empty falls
                back to the platform-level chat (for ops alerts only).
    `bot_token` — usually leave empty; falls back to the platform bot token.
    """
    token = bot_token or PLATFORM_TELEGRAM_BOT_TOKEN
    target = chat_id or PLATFORM_TELEGRAM_CHAT_ID
    if not token or not target:
        logger.warning("[TELEGRAM] Bot token or chat_id not set — skipping.")
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": target, "text": message, "parse_mode": "Markdown"},
            timeout=5,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"[TELEGRAM] Failed: {e}")
        return False


def notify_booking_confirmed(
    caller_name: str, caller_phone: str, booking_time_iso: str,
    booking_id: str, notes: str = "", tts_voice: str = "", ai_summary: str = "",
    tenant_chat_id: str = "",
) -> bool:
    try:
        dt = datetime.fromisoformat(booking_time_iso)
        readable = dt.strftime("%A, %d %B %Y at %-I:%M %p IST")
    except Exception:
        readable = booking_time_iso

    message = (
        f"✅ *New Booking Confirmed!*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *Name:*        {caller_name}\n"
        f"📞 *Phone:*       `{caller_phone}`\n"
        f"📅 *Time:*        {readable}\n"
        f"🔖 *Booking ID:*  `{booking_id}`\n"
        f"📝 *Notes:*       {notes or '—'}\n"
        f"🎙️ *Voice:*       {tts_voice or '—'}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        + (f"💬 *AI Summary:*\n_{ai_summary}_\n\n" if ai_summary else "")
        + f"_Booked via Aries AI Voice Agent_ 🤖"
    )
    return send_telegram(message, chat_id=tenant_chat_id)


def notify_booking_cancelled(
    caller_name: str, caller_phone: str, booking_id: str, reason: str = "",
    tenant_chat_id: str = "",
) -> bool:
    message = (
        f"❌ *Booking Cancelled*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *Name:*       {caller_name}\n"
        f"📞 *Phone:*      `{caller_phone}`\n"
        f"🔖 *Booking ID:* `{booking_id}`\n"
        f"💬 *Reason:*     {reason or 'Caller changed mind'}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"_Aries AI Voice Agent_ 🤖"
    )
    return send_telegram(message, chat_id=tenant_chat_id)


def notify_call_no_booking(
    caller_name: str, caller_phone: str, call_summary: str = "",
    tts_voice: str = "", ai_summary: str = "", duration_seconds: int = 0,
    tenant_chat_id: str = "",
) -> bool:
    message = (
        f"📵 *Call Ended — No Booking*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *Name:*        {caller_name or 'Unknown'}\n"
        f"📞 *Phone:*       `{caller_phone}`\n"
        f"⏱️ *Duration:*    {duration_seconds}s\n"
        f"🎙️ *Voice:*       {tts_voice or '—'}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        + f"💬 *Summary:*\n_{ai_summary or call_summary or 'Caller did not schedule.'}_\n\n"
        + f"_Consider a manual follow-up_ 📲\n"
        f"_Aries AI Voice Agent_ 🤖"
    )
    return send_telegram(message, chat_id=tenant_chat_id)


# Agent errors stay on the platform-level chat (ops alerts), since a broken
# tenant config is exactly when tenant_chat_id might also be wrong.
def notify_agent_error(caller_phone: str, error: str) -> bool:
    message = (
        f"⚠️ *Agent Error During Call*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📞 *Phone:*  `{caller_phone}`\n"
        f"🔴 *Error:*  `{error}`\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"_Aries AI Voice Agent_ 🤖"
    )
    return send_telegram(message)


async def send_webhook(webhook_url: str, event_type: str, payload: dict) -> bool:
    if not webhook_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                webhook_url,
                json={"event": event_type, "timestamp": datetime.utcnow().isoformat(), "data": payload},
                headers={"Content-Type": "application/json"},
            )
            return resp.status_code < 300
    except Exception as e:
        logger.warning(f"[WEBHOOK] Failed to deliver {event_type}: {e}")
        return False
