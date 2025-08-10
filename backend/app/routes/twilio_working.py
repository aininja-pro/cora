"""
Working Twilio webhook with speech recognition
This version works without complex dependencies
"""

from fastapi import APIRouter, Request
from fastapi.responses import Response
import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio-v2", tags=["twilio-v2"])

# Store active calls in memory for now
active_calls = {}

@router.post("/incoming-call")
async def handle_incoming_call(request: Request):
    """
    Handle incoming Twilio calls with speech recognition
    """
    try:
        # Get form data from Twilio
        form_data = await request.form()
        form_dict = dict(form_data)
        
        # Extract call information
        call_sid = form_dict.get('CallSid', 'unknown')
        from_number = form_dict.get('From', 'Unknown')
        from_city = form_dict.get('FromCity', 'Unknown')
        from_state = form_dict.get('FromState', 'Unknown')
        
        # Log the call
        logger.info(f"""
        📞 INCOMING CALL:
        Call ID: {call_sid}
        From: {from_number}
        Location: {from_city}, {from_state}
        """)
        
        # Store call info
        active_calls[call_sid] = {
            'phone': from_number,
            'city': from_city,
            'state': from_state,
            'started': datetime.now().isoformat()
        }
        
        # Create TwiML response with speech recognition
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">
        Hi! This is Cora from your real estate team. 
        I can help you find the perfect property or answer questions about our listings.
        How can I help you today?
    </Say>
    <Gather input="speech" 
            action="/api/twilio-v2/process-speech" 
            method="POST"
            speechTimeout="auto"
            language="en-US">
        <Say>I'm listening. Tell me what you're looking for.</Say>
    </Gather>
    <Say>I didn't catch that. Please call back if you need assistance.</Say>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error in incoming call: {str(e)}")
        # Return error message
        error_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">
        I apologize, but I'm having trouble connecting right now. 
        Please try again in a moment or call our office directly.
    </Say>
</Response>"""
        return Response(content=error_twiml, media_type="application/xml")

@router.post("/process-speech")
async def process_speech(request: Request):
    """
    Process speech input from caller
    """
    try:
        # Get form data
        form_data = await request.form()
        form_dict = dict(form_data)
        
        # Extract speech result
        call_sid = form_dict.get('CallSid', '')
        speech_result = form_dict.get('SpeechResult', '')
        confidence = form_dict.get('Confidence', '0')
        
        logger.info(f"Caller said: '{speech_result}' (confidence: {confidence})")
        
        # Get call data
        call_data = active_calls.get(call_sid, {})
        
        # Generate response based on what they said
        response_text = generate_response(speech_result)
        
        # Create TwiML response
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">{response_text}</Say>
    <Gather input="speech" 
            action="/api/twilio-v2/process-speech" 
            method="POST"
            speechTimeout="auto"
            language="en-US">
        <Say>Is there anything else I can help you with?</Say>
    </Gather>
    <Say>Thank you for calling. Have a great day!</Say>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error processing speech: {str(e)}")
        # Continue conversation despite error
        continue_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">
        I didn't quite understand that. Could you please repeat what you're looking for?
    </Say>
    <Gather input="speech" 
            action="/api/twilio-v2/process-speech" 
            method="POST"
            speechTimeout="auto">
    </Gather>
</Response>"""
        return Response(content=continue_twiml, media_type="application/xml")

@router.post("/call-status")
async def handle_call_status(request: Request):
    """
    Handle call status updates
    """
    try:
        form_data = await request.form()
        form_dict = dict(form_data)
        
        call_sid = form_dict.get('CallSid', '')
        call_status = form_dict.get('CallStatus', '')
        duration = form_dict.get('CallDuration', '0')
        
        logger.info(f"Call {call_sid} ended: {call_status} (duration: {duration}s)")
        
        # Clean up call data
        if call_sid in active_calls:
            del active_calls[call_sid]
        
        return {"success": True}
    except Exception as e:
        logger.error(f"Error in call status: {str(e)}")
        return {"success": False}

def generate_response(user_message: str) -> str:
    """
    Generate response based on user input
    For now, using simple logic. Will integrate GPT-4 next.
    """
    message_lower = user_message.lower()
    
    # Check for property mentions
    if '123 main' in message_lower:
        return (
            "Yes! 123 Main Street is a beautiful 3 bedroom, 2 and a half bath home "
            "in downtown Austin. It's priced at 489 thousand dollars and features "
            "granite countertops and hardwood floors throughout. "
            "Would you like to schedule a showing?"
        )
    elif '456 oak' in message_lower:
        return (
            "456 Oak Avenue is a charming 2 bedroom, 2 bath condo priced at "
            "325 thousand dollars. It has been recently renovated with stainless steel appliances. "
            "It's perfect for first-time buyers. Shall I schedule a viewing for you?"
        )
    elif '789 pine' in message_lower:
        return (
            "789 Pine Lane is our luxury listing. It's a 4 bedroom, 3 bath home "
            "priced at 750 thousand dollars. It features a pool and smart home technology. "
            "Would you like more details?"
        )
    elif 'schedule' in message_lower or 'showing' in message_lower or 'appointment' in message_lower:
        return (
            "I'd be happy to schedule a showing for you. "
            "We have availability tomorrow at 2 PM or Thursday at 10 AM. "
            "Which time works better for you?"
        )
    elif 'available' in message_lower or 'listings' in message_lower or 'properties' in message_lower:
        return (
            "We currently have three great properties available. "
            "123 Main Street at 489 thousand, 456 Oak Avenue at 325 thousand, "
            "and 789 Pine Lane at 750 thousand. "
            "Which price range interests you?"
        )
    elif 'thank' in message_lower or 'bye' in message_lower or 'goodbye' in message_lower:
        return (
            "You're very welcome! Feel free to call anytime if you have more questions. "
            "Have a wonderful day!"
        )
    else:
        return (
            "I can help you find the perfect property. "
            "We have homes ranging from 325 thousand to 750 thousand dollars. "
            "What features are most important to you?"
        )

@router.get("/test")
async def test_endpoint():
    """Test if this route is accessible"""
    return {"status": "working", "message": "Twilio V2 endpoint is ready"}