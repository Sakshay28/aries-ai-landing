"""
setup_trunk.py — Create a VoBiz SIP Outbound Trunk in LiveKit.

Run this ONCE after setting up your VoBiz account and LiveKit project.
After running, copy the TRUNK_ID (ST_...) printed to the console.
"""
import asyncio
import os
from dotenv import load_dotenv
from livekit import api

load_dotenv()


async def setup_outbound_trunk():
    url        = os.getenv("LIVEKIT_URL")
    api_key    = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    sip_domain = os.getenv("VOBIZ_SIP_DOMAIN")
    username   = os.getenv("VOBIZ_USERNAME")
    password   = os.getenv("VOBIZ_PASSWORD")
    outbound_number = os.getenv("VOBIZ_OUTBOUND_NUMBER")

    if not all([url, api_key, api_secret, sip_domain, username, password]):
        print("❌ Missing required env vars. Please fill in .env")
        return

    lk_api = api.LiveKitAPI(url=url, api_key=api_key, api_secret=api_secret)

    try:
        trunk = await lk_api.sip.create_sip_outbound_trunk(
            api.CreateSIPOutboundTrunkRequest(
                trunk=api.SIPOutboundTrunkInfo(
                    name="VoBiz Outbound Trunk — Aries AI",
                    address=sip_domain,
                    numbers=[outbound_number],
                    auth_username=username,
                    auth_password=password,
                )
            )
        )
        print("\n✅ SIP Outbound Trunk Created!")
        print(f"   Trunk ID  : {trunk.sip_trunk_id}")
        print(f"   Name      : {trunk.name}")
        print(f"   Address   : {trunk.address}")
        print(f"   Number(s) : {', '.join(trunk.numbers)}")
        print("\n📋 Next step:")
        print(f"   Set OUTBOUND_TRUNK_ID={trunk.sip_trunk_id} in your .env")
    except Exception as e:
        print(f"❌ Failed to create trunk: {e}")
    finally:
        await lk_api.aclose()


if __name__ == "__main__":
    asyncio.run(setup_outbound_trunk())
