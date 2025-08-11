"""
Simple Twilio webhook with Amazon Polly - no form parsing
This should work without issues
"""

from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(prefix="/api/twilio-polly-simple", tags=["twilio-polly-simple"])

@router.post("/voice")
async def simple_polly_voice():
    """
    Returns Polly-enhanced TwiML without any form processing
    """
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">
        <prosody rate="95%" pitch="-2%">
            Hello! This is Cora from your real estate team. 
            I'm using Amazon Polly for a more natural voice.
            We have three beautiful properties available.
            123 Main Street, a 3-bedroom home for 489 thousand dollars.
            456 Oak Avenue, a 2-bedroom condo for 325 thousand dollars.
            And 789 Pine Lane, a luxury estate for 750 thousand dollars.
            Which one interests you most?
        </prosody>
    </Say>
    <Pause length="2"/>
    <Say voice="Polly.Joanna">
        <prosody rate="90%">
            Please call back anytime to learn more about these properties.
            Have a wonderful day!
        </prosody>
    </Say>
</Response>"""
    
    return Response(content=twiml, media_type="application/xml")

@router.get("/test")
async def test():
    return {"status": "working", "voice": "Polly.Joanna"}