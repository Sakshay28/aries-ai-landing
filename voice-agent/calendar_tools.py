import os
import logging
import requests
import httpx
from datetime import datetime

logger = logging.getLogger("calendar-tools")

CAL_BASE = "https://api.cal.com/v1"


def get_cal_creds() -> dict:
    return {
        "api_key":  os.environ.get("CAL_API_KEY", ""),
        "event_id": int(os.environ.get("CAL_EVENT_TYPE_ID", "0") or "0"),
    }


def get_available_slots(date_str: str) -> list:
    """Fetch open slots for a given date. Supports Cal.com and Google Calendar."""
    gcal_id    = os.environ.get("GOOGLE_CALENDAR_ID", "")
    gcal_creds = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "google_creds.json")
    if gcal_id and os.path.exists(gcal_creds):
        try:
            return _get_slots_gcal(date_str, gcal_id, gcal_creds)
        except Exception as e:
            logger.warning(f"[GCAL] Falling back to Cal.com: {e}")
    return _get_slots_calcom(date_str)


def _get_slots_calcom(date_str: str) -> list:
    creds = get_cal_creds()
    try:
        resp = requests.get(
            f"{CAL_BASE}/slots",
            headers={"Content-Type": "application/json"},
            params={
                "apiKey":      creds["api_key"],
                "eventTypeId": creds["event_id"],
                "startTime":   f"{date_str}T00:00:00.000Z",
                "endTime":     f"{date_str}T23:59:59.000Z",
            },
            timeout=8,
        )
        resp.raise_for_status()
        raw_slots = resp.json().get("data", {}).get("slots", {}).get(date_str, [])
        slots = []
        for s in raw_slots:
            dt = datetime.fromisoformat(s["time"])
            slots.append({"time": s["time"], "label": dt.strftime("%-I:%M %p")})
        logger.info(f"[CAL] {len(slots)} slots for {date_str}")
        return slots
    except Exception as e:
        logger.error(f"[CAL] get_available_slots error: {e}")
        return []


def _get_slots_gcal(date_str: str, calendar_id: str, creds_file: str) -> list:
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    import pytz
    from datetime import timedelta

    creds   = service_account.Credentials.from_service_account_file(
        creds_file, scopes=["https://www.googleapis.com/auth/calendar.readonly"])
    service = build("calendar", "v3", credentials=creds)
    start   = f"{date_str}T00:00:00+05:30"
    end     = f"{date_str}T23:59:59+05:30"
    result  = service.freebusy().query(body={
        "timeMin": start, "timeMax": end, "items": [{"id": calendar_id}],
    }).execute()

    busy_slots = result.get("calendars", {}).get(calendar_id, {}).get("busy", [])
    ist        = pytz.timezone("Asia/Kolkata")
    day_start  = ist.localize(datetime.strptime(f"{date_str} 10:00", "%Y-%m-%d %H:%M"))
    day_end    = ist.localize(datetime.strptime(f"{date_str} 19:00", "%Y-%m-%d %H:%M"))
    busy_ranges = [(datetime.fromisoformat(b["start"]).astimezone(ist),
                    datetime.fromisoformat(b["end"]).astimezone(ist)) for b in busy_slots]

    free_slots, slot = [], day_start
    while slot < day_end:
        slot_end = slot + timedelta(minutes=30)
        if not any(bs <= slot < be for bs, be in busy_ranges):
            free_slots.append({"time": slot.isoformat(), "label": slot.strftime("%-I:%M %p")})
        slot = slot_end
    logger.info(f"[GCAL] {len(free_slots)} free slots for {date_str}")
    return free_slots


# NOTE: A sync `create_booking()` wrapper used to live here, but it called
# `asyncio.get_event_loop().run_until_complete(...)` from inside a running
# event loop (the LiveKit agent), which raises `RuntimeError: This event loop
# is already running`. Removed entirely — callers must `await async_create_booking`.
# The agent at `agent.py:495` already uses the async version.


async def async_create_booking(start_time: str, caller_name: str,
                                caller_phone: str, notes: str = "") -> dict:
    gcal_id    = os.environ.get("GOOGLE_CALENDAR_ID", "")
    gcal_creds = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "google_creds.json")
    if gcal_id and os.path.exists(gcal_creds):
        return await _create_booking_gcal(start_time, caller_name, caller_phone, notes, gcal_id, gcal_creds)
    return await _create_booking_calcom(start_time, caller_name, caller_phone, notes)


async def _create_booking_calcom(start_time: str, caller_name: str,
                                  caller_phone: str, notes: str) -> dict:
    creds   = get_cal_creds()
    payload = {
        "eventTypeId": creds["event_id"],
        "start": start_time,
        "attendee": {
            "name":        caller_name,
            "email":       f"{caller_phone.replace('+','').replace(' ','')}@voiceagent.placeholder",
            "phoneNumber": caller_phone,
            "timeZone":    "Asia/Kolkata",
            "language":    "en",
        },
        "bookingFieldsResponses": {
            "notes": notes or f"Booked via Aries AI Voice Agent. Phone: {caller_phone}",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                "https://api.cal.com/v2/bookings",
                headers={"Authorization": f"Bearer {creds['api_key']}",
                         "cal-api-version": "2024-08-13",
                         "Content-Type":    "application/json"},
                json=payload,
            )
            if resp.status_code not in (200, 201):
                return {"success": False, "booking_id": None, "message": resp.text}
            uid = resp.json().get("data", {}).get("uid", "unknown")
            return {"success": True, "booking_id": uid, "message": "Booking confirmed"}
    except httpx.TimeoutException:
        return {"success": False, "booking_id": None, "message": "Booking timed out."}
    except Exception as e:
        return {"success": False, "booking_id": None, "message": str(e)}


async def _create_booking_gcal(start_time: str, caller_name: str, caller_phone: str,
                                notes: str, calendar_id: str, creds_file: str) -> dict:
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account
        from datetime import timedelta

        creds   = service_account.Credentials.from_service_account_file(
            creds_file, scopes=["https://www.googleapis.com/auth/calendar"])
        service = build("calendar", "v3", credentials=creds)
        dt_start = datetime.fromisoformat(start_time)
        dt_end   = dt_start + timedelta(minutes=30)
        event = {
            "summary":     f"Appointment — {caller_name}",
            "description": f"Phone: {caller_phone}\nNotes: {notes}\nBooked via Aries AI Voice Agent",
            "start": {"dateTime": dt_start.isoformat(), "timeZone": "Asia/Kolkata"},
            "end":   {"dateTime": dt_end.isoformat(),   "timeZone": "Asia/Kolkata"},
        }
        created  = service.events().insert(calendarId=calendar_id, body=event).execute()
        event_id = created.get("id", "unknown")
        return {"success": True, "booking_id": event_id, "message": "Google Calendar event created"}
    except Exception as e:
        return {"success": False, "booking_id": None, "message": str(e)}


async def async_cancel_booking(booking_id: str, reason: str = "Cancelled by caller") -> dict:
    """Cancel a Cal.com booking. Async-only — never call sync from inside the
    LiveKit agent's event loop (see note above on async_create_booking)."""
    creds = get_cal_creds()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.delete(
                f"{CAL_BASE}/bookings/{booking_id}/cancel",
                params={"apiKey": creds["api_key"]},
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code >= 300:
                return {"success": False, "message": resp.text}
            return {"success": True, "message": "Cancelled successfully"}
    except Exception as e:
        return {"success": False, "message": str(e)}
