"""
Simple Twilio webhook for testing
"""

from fastapi import APIRouter, Request
from fastapi.responses import Response
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio-test", tags=["twilio-test"])

@router.post("/simple")
async def simple_webhook(request: Request):
    """
    Simplest possible Twilio webhook for testing
    """
    logger.info("Simple webhook called!")
    
    # Return basic TwiML
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">
        Hello! This is Cora from your real estate team. 
        I can help you with property information. 
        Tell me, what kind of property are you looking for today?
    </Say>
    <Pause length="1"/>
    <Say voice="alice">
        For example, you can ask about 123 Main Street, or tell me what features you're looking for.
    </Say>
</Response>"""
    
    return Response(content=twiml, media_type="application/xml")

@router.get("/test")
async def test_endpoint():
    """Test if this route is accessible"""
    return {"status": "ok", "message": "Twilio test endpoint is working"}