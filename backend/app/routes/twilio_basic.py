"""
Basic Twilio webhook - minimal dependencies
This will definitely work!
"""

from fastapi import APIRouter, Request
from fastapi.responses import Response
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio-basic", tags=["twilio-basic"])

@router.post("/voice")
async def handle_voice(request: Request):
    """
    Most basic voice webhook possible
    """
    try:
        # Log that we received the call
        form_data = await request.form()
        from_number = form_data.get('From', 'Unknown')
        logger.info(f"Incoming call from: {from_number}")
        
        # Simple TwiML response
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">
        Hello! This is Cora from your real estate team. 
        I can help you with property information.
    </Say>
    <Pause length="1"/>
    <Gather input="speech" action="/api/twilio-basic/handle-speech" method="POST" speechTimeout="auto">
        <Say>Please tell me what property you're interested in, or say what you're looking for.</Say>
    </Gather>
    <Say>I didn't hear anything. Please call back if you need help.</Say>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error in voice webhook: {str(e)}")
        # Return basic error response
        error_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Sorry, we're experiencing technical difficulties. Please try again later.</Say>
</Response>"""
        return Response(content=error_twiml, media_type="application/xml")

@router.post("/handle-speech")
async def handle_speech(request: Request):
    """
    Handle speech input
    """
    try:
        form_data = await request.form()
        speech_result = form_data.get('SpeechResult', '')
        
        logger.info(f"Caller said: {speech_result}")
        
        # Simple keyword-based responses
        speech_lower = speech_result.lower()
        
        if '123 main' in speech_lower:
            response_text = "123 Main Street is a beautiful 3 bedroom home in Austin, priced at 489 thousand dollars. It has granite countertops and hardwood floors. Would you like to schedule a showing?"
        elif '456 oak' in speech_lower:
            response_text = "456 Oak Avenue is a 2 bedroom condo for 325 thousand dollars. Perfect for first-time buyers!"
        elif '789 pine' in speech_lower:
            response_text = "789 Pine Lane is our luxury listing at 750 thousand, with 4 bedrooms and a pool."
        else:
            response_text = "We have properties from 325 thousand to 750 thousand dollars. Which price range interests you?"
        
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">{response_text}</Say>
    <Pause length="1"/>
    <Gather input="speech" action="/api/twilio-basic/handle-speech" method="POST" speechTimeout="auto">
        <Say>Is there anything else I can help you with?</Say>
    </Gather>
    <Say>Thank you for calling! Have a great day!</Say>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error handling speech: {str(e)}")
        fallback_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>I didn't understand that. Please try again.</Say>
</Response>"""
        return Response(content=fallback_twiml, media_type="application/xml")

@router.get("/test")
async def test():
    """Test endpoint"""
    return {"status": "ok", "message": "Twilio basic endpoint working"}