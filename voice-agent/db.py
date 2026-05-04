import os
import time
import logging
from supabase import create_client, Client

logger = logging.getLogger("db")

_ANALYTICS_COLUMNS = {
    "sentiment", "was_booked", "interrupt_count",
    "estimated_cost_usd", "call_date", "call_hour", "call_day_of_week", "tenant_id",
}
_BASE_COLUMNS = {"phone_number", "duration_seconds", "transcript", "summary",
                 "recording_url", "caller_name"}

_MAX_RETRIES  = 3
_RETRY_DELAYS = [1.0, 2.0, 4.0]


def _is_retryable(err_str: str) -> bool:
    transient = ("525", "ssl", "timeout", "connection", "network", "502", "503", "504")
    el = err_str.lower()
    return any(k in el for k in transient)


def _is_schema_error(err_str: str) -> bool:
    return "PGRST204" in err_str or "schema cache" in err_str.lower()


def get_supabase() -> Client | None:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        logger.error(f"Failed to init Supabase client: {e}")
        return None


def save_call_log(
    phone: str,
    duration: int,
    transcript: str,
    summary: str = "",
    recording_url: str = "",
    caller_name: str = "",
    sentiment: str = "unknown",
    estimated_cost_usd: float | None = None,
    call_date: str | None = None,
    call_hour: int | None = None,
    call_day_of_week: str | None = None,
    was_booked: bool = False,
    interrupt_count: int = 0,
    tenant_id: str = "",
) -> dict:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        logger.info(f"Supabase not configured. Local log → {phone} {duration}s")
        return {"success": False, "message": "Supabase not configured"}

    supabase = get_supabase()
    if not supabase:
        return {"success": False, "message": "Supabase client failed"}

    full_data: dict = {
        "phone_number":     phone,
        "duration_seconds": duration,
        "transcript":       transcript,
        "summary":          summary,
        "sentiment":        sentiment,
        "was_booked":       was_booked,
        "interrupt_count":  interrupt_count,
    }
    if recording_url:                   full_data["recording_url"]      = recording_url
    if caller_name:                     full_data["caller_name"]         = caller_name
    if estimated_cost_usd is not None:  full_data["estimated_cost_usd"] = estimated_cost_usd
    if call_date:                       full_data["call_date"]           = call_date
    if call_hour is not None:           full_data["call_hour"]           = call_hour
    if call_day_of_week:                full_data["call_day_of_week"]    = call_day_of_week
    if tenant_id:                       full_data["tenant_id"]           = tenant_id

    base_data: dict = {k: v for k, v in full_data.items() if k not in _ANALYTICS_COLUMNS}

    def _try_insert(data: dict, label: str) -> dict:
        for attempt in range(_MAX_RETRIES):
            try:
                res = supabase.table("call_logs").insert(data).execute()
                logger.info(f"Saved call log for {phone} ({label})")
                return {"success": True, "data": res.data}
            except Exception as e:
                err = str(e)
                if _is_schema_error(err):
                    raise RuntimeError("SCHEMA_ERROR:" + err)
                if _is_retryable(err) and attempt < _MAX_RETRIES - 1:
                    time.sleep(_RETRY_DELAYS[attempt])
                    continue
                logger.error(f"Failed to save call log ({label}): {e}")
                return {"success": False, "message": err}
        return {"success": False, "message": "Max retries exceeded"}

    try:
        return _try_insert(full_data, "full")
    except RuntimeError as e:
        if "SCHEMA_ERROR" in str(e):
            logger.warning("Analytics columns missing — falling back to base columns.")
            return _try_insert(base_data, "base-fallback")
        raise


def fetch_call_logs(limit: int = 50, tenant_id: str = "") -> list:
    supabase = get_supabase()
    if not supabase:
        return []
    for attempt in range(_MAX_RETRIES):
        try:
            q = supabase.table("call_logs").select("*").order("created_at", desc=True).limit(limit)
            if tenant_id:
                q = q.eq("tenant_id", tenant_id)
            return q.execute().data or []
        except Exception as e:
            if _is_retryable(str(e)) and attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAYS[attempt])
                continue
            logger.error(f"Failed to fetch call logs: {e}")
            return []
    return []


def fetch_stats(tenant_id: str = "") -> dict:
    _empty = {"total_calls": 0, "total_bookings": 0, "avg_duration": 0, "booking_rate": 0}
    supabase = get_supabase()
    if not supabase:
        return _empty
    try:
        q = supabase.table("call_logs").select("duration_seconds, summary, was_booked")
        if tenant_id:
            q = q.eq("tenant_id", tenant_id)
        rows  = q.execute().data or []
        total = len(rows)
        bookings  = sum(1 for r in rows if r.get("was_booked"))
        durations = [r["duration_seconds"] for r in rows if r.get("duration_seconds")]
        avg_dur   = round(sum(durations) / len(durations)) if durations else 0
        rate      = round((bookings / total) * 100) if total else 0
        return {"total_calls": total, "total_bookings": bookings, "avg_duration": avg_dur, "booking_rate": rate}
    except Exception as e:
        logger.error(f"Failed to fetch stats: {e}")
        return _empty
