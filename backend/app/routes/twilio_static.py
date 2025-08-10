"""
Static Twilio webhook - no form parsing, just returns TwiML
This MUST work!
"""

from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(prefix="/api/twilio-static", tags=["twilio-static"])

@router.post("/voice")
async def static_voice():
    """
    Returns static TwiML without any processing
    """
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">
        Hello! This is Cora from your real estate team. 
        We have three beautiful properties available.
        123 Main Street for 489 thousand dollars.
        456 Oak Avenue for 325 thousand dollars.
        And 789 Pine Lane for 750 thousand dollars.
        Thank you for calling!
    </Say>
</Response>"""
    
    return Response(content=twiml, media_type="application/xml")

@router.get("/test")
async def test():
    return {"status": "working"}