"""
make_call.py — Trigger an outbound AI voice call via LiveKit.

Usage:
    python make_call.py --to +919876543210
    python make_call.py --to +919876543210 --tenant abc123
    python make_call.py --to +919876543210 --tenant abc123 --name "Ravi Sharma"

Can also be called programmatically from the Next.js API via HTTP to the ui_server.
"""
import argparse
import asyncio
import os
import random
import json
from dotenv import load_dotenv
from livekit import api

load_dotenv()


async def dispatch_call(
    phone_number: str,
    tenant_id: str = "",
    caller_name: str = "",
) -> dict:
    """Core dispatch logic — reusable from both CLI and HTTP server.

    Two LiveKit calls are required for outbound dialing:
      1. agent_dispatch.create_dispatch — tells the agent worker to join the room.
      2. sip.create_sip_participant   — actually dials the phone via the SIP trunk.
    Skipping step 2 (the previous bug) leaves the agent waiting in an empty room
    while the phone never rings.
    """
    if not phone_number.startswith("+"):
        return {"success": False, "error": "Phone number must start with '+' and country code."}

    url        = os.getenv("LIVEKIT_URL")
    api_key    = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    trunk_id   = os.getenv("OUTBOUND_TRUNK_ID")

    if not (url and api_key and api_secret):
        return {"success": False, "error": "LiveKit credentials missing in .env"}
    if not trunk_id:
        return {
            "success": False,
            "error": "OUTBOUND_TRUNK_ID missing in .env. Run `python setup_trunk.py` first.",
        }

    lk_api    = api.LiveKitAPI(url=url, api_key=api_key, api_secret=api_secret)
    room_name = f"call-{phone_number.replace('+', '')}-{random.randint(1000, 9999)}"
    sip_identity = f"sip_{phone_number.replace('+', '')}"

    metadata = json.dumps({
        "phone_number": phone_number,
        "tenant_id":    tenant_id,
        "caller_name":  caller_name,
    })

    try:
        # Step 1 — Dispatch the agent worker into the room.
        dispatch_request = api.CreateAgentDispatchRequest(
            agent_name="outbound-caller",  # Must match agent.py WorkerOptions
            room=room_name,
            metadata=metadata,
        )
        dispatch = await lk_api.agent_dispatch.create_dispatch(dispatch_request)

        # Step 2 — Place the actual SIP outbound call. This is what makes the phone ring.
        sip_request = api.CreateSIPParticipantRequest(
            sip_trunk_id=trunk_id,
            sip_call_to=phone_number,
            room_name=room_name,
            participant_identity=sip_identity,
            participant_name=caller_name or "Outbound Caller",
            wait_until_answered=False,  # Don't block the API; agent waits in room.
        )
        sip_participant = await lk_api.sip.create_sip_participant(sip_request)

        return {
            "success":         True,
            "dispatch_id":     dispatch.id,
            "room_name":       room_name,
            "sip_call_id":     getattr(sip_participant, "sip_call_id", "") or getattr(sip_participant, "participant_id", ""),
            "phone":           phone_number,
            "tenant_id":       tenant_id,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await lk_api.aclose()


async def main():
    parser = argparse.ArgumentParser(description="Trigger an outbound AI call via Aries AI Voice Agent.")
    parser.add_argument("--to",     required=True, help="Phone number to call (e.g. +91...)")
    parser.add_argument("--tenant", default="",    help="Tenant ID for multi-tenant config")
    parser.add_argument("--name",   default="",    help="Caller/lead name for personalisation")
    args = parser.parse_args()

    print(f"📞 Initiating call to {args.to} (tenant: {args.tenant or 'default'})...")
    result = await dispatch_call(
        phone_number=args.to,
        tenant_id=args.tenant,
        caller_name=args.name,
    )

    if result["success"]:
        print("\n✅ Call Dispatched Successfully!")
        print(f"   Dispatch ID : {result['dispatch_id']}")
        print(f"   Room        : {result['room_name']}")
        print(f"   Tenant      : {result['tenant_id'] or 'default'}")
        print("-" * 40)
        print("Agent is joining the room and dialling the number.")
        print("Check agent terminal for live logs.")
    else:
        print(f"\n❌ Failed: {result['error']}")


if __name__ == "__main__":
    asyncio.run(main())
