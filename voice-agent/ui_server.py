"""
ui_server.py — Lightweight FastAPI HTTP server that wraps the voice agent.
The Next.js dashboard calls this service to trigger/manage outbound calls.

Endpoints:
  POST /call/outbound  — trigger a call  {phone, tenant_id, caller_name}
  GET  /calls/active   — list active calls from Supabase
  GET  /calls/logs     — recent call logs
  GET  /health         — health check
"""
import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ui-server")

app = FastAPI(title="Aries AI Voice Agent Server", version="1.0.0")

# Allow calls from Next.js (localhost:3000 in dev, production domain in prod)
ALLOWED_ORIGINS = os.getenv("VOICE_SERVER_CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ────────────────────────────────────────────────────────────
class OutboundCallRequest(BaseModel):
    phone:       str
    tenant_id:   str = ""
    caller_name: str = ""

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "aries-voice-agent"}


@app.post("/call/outbound")
async def trigger_outbound_call(body: OutboundCallRequest):
    """Trigger an outbound AI phone call."""
    from make_call import dispatch_call
    import asyncio
    result = await dispatch_call(
        phone_number=body.phone,
        tenant_id=body.tenant_id,
        caller_name=body.caller_name,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Dispatch failed"))
    logger.info(f"[UI-SERVER] Call dispatched: {result['dispatch_id']} → {body.phone}")
    return result


@app.get("/calls/active")
def get_active_calls():
    """Return currently active calls from Supabase."""
    import db
    sb = db.get_supabase()
    if not sb:
        return []
    try:
        res = (sb.table("active_calls")
               .select("*")
               .eq("status", "active")
               .order("started_at", desc=True)
               .execute())
        return res.data or []
    except Exception as e:
        logger.error(f"[UI-SERVER] get_active_calls failed: {e}")
        return []


@app.get("/calls/logs")
def get_call_logs(limit: int = 50):
    """Return recent call logs."""
    import db
    return db.fetch_call_logs(limit=limit)


@app.get("/calls/stats")
def get_stats():
    """Return aggregate call stats."""
    import db
    return db.fetch_stats()


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("VOICE_SERVER_PORT", "8080"))
    uvicorn.run("ui_server:app", host="0.0.0.0", port=port, reload=False)
