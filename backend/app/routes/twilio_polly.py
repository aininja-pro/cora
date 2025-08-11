"""
Twilio webhook with Amazon Polly voices (built into Twilio)
Better quality than basic Twilio, without external API calls
"""

from fastapi import APIRouter, Request
from fastapi.responses import Response
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio-polly", tags=["twilio-polly"])

# Store active calls
active_calls = {}

@router.post("/voice")
async def handle_voice_with_polly(request: Request):
    """
    Handle incoming call with Amazon Polly voices (via Twilio)
    """
    try:
        # Get form data
        form_data = await request.form()
        form_dict = dict(form_data)
        
        # Extract call info
        call_sid = form_dict.get('CallSid', 'unknown')
        from_number = form_dict.get('From', 'Unknown')
        from_city = form_dict.get('FromCity', 'Unknown')
        from_state = form_dict.get('FromState', 'Unknown')
        
        logger.info(f"📞 Incoming call from {from_number} ({from_city}, {from_state})")
        
        # Store call info
        active_calls[call_sid] = {
            'phone': from_number,
            'city': from_city,
            'state': from_state,
            'started': datetime.now().isoformat()
        }
        
        # Use Amazon Polly voices through Twilio
        # Available Polly voices: Joanna, Matthew, Ivy, Justin, Kendra, Kimberly, Salli, Joey, Amy, Brian
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">
        <prosody rate="95%" pitch="-2%">
            Hello! This is Cora from your real estate team. 
            I'm here to help you find your dream property. 
            What type of home are you looking for today?
        </prosody>
    </Say>
    <Gather input="speech" 
            action="/api/twilio-polly/process-speech" 
            method="POST"
            speechTimeout="auto"
            language="en-US">
        <Say voice="Polly.Joanna">I'm listening...</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't hear anything. Please call back if you need help.</Say>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error in voice handler: {str(e)}")
        error_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I apologize for the technical difficulty. Please try again later.</Say>
</Response>"""
        return Response(content=error_twiml, media_type="application/xml")

@router.post("/process-speech")
async def process_speech_with_polly(request: Request):
    """
    Process speech input and respond with Polly voice
    """
    try:
        form_data = await request.form()
        form_dict = dict(form_data)
        
        call_sid = form_dict.get('CallSid', '')
        speech_result = form_dict.get('SpeechResult', '')
        confidence = form_dict.get('Confidence', '0')
        
        logger.info(f"Caller said: '{speech_result}' (confidence: {confidence})")
        
        # Generate contextual response
        response_text = generate_property_response(speech_result)
        
        # Use Polly voice with prosody for more natural speech
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">
        <prosody rate="95%" pitch="-2%">
            {response_text}
        </prosody>
    </Say>
    <Gather input="speech" 
            action="/api/twilio-polly/process-speech" 
            method="POST"
            speechTimeout="auto"
            language="en-US">
        <Say voice="Polly.Joanna">
            <prosody rate="90%">
                Is there anything else I can help you with?
            </prosody>
        </Say>
    </Gather>
    <Say voice="Polly.Joanna">
        <prosody rate="95%" pitch="-1%">
            Thank you for calling. Have a wonderful day!
        </prosody>
    </Say>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error processing speech: {str(e)}")
        fallback_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I didn't understand that. Could you please repeat?</Say>
</Response>"""
        return Response(content=fallback_twiml, media_type="application/xml")

def generate_property_response(user_message: str) -> str:
    """
    Generate contextual property responses
    """
    message_lower = user_message.lower()
    
    if '123 main' in message_lower or 'main street' in message_lower:
        return (
            "Oh, you're interested in 123 Main Street! That's one of my favorites. "
            "It's a stunning 3-bedroom home with beautiful hardwood floors and granite countertops. "
            "At 489 thousand, it's perfectly priced for the downtown Austin market. "
            "Would you like to schedule a private showing this week?"
        )
    elif '456 oak' in message_lower or 'oak avenue' in message_lower:
        return (
            "456 Oak Avenue is a fantastic choice! It's a modern 2-bedroom condo "
            "that was just renovated last year. At 325 thousand, it's ideal for "
            "first-time buyers or anyone looking for a low-maintenance lifestyle. "
            "I can arrange a tour as early as tomorrow if you'd like."
        )
    elif '789 pine' in message_lower or 'pine lane' in message_lower:
        return (
            "Excellent taste! 789 Pine Lane is our premier luxury listing. "
            "This 4-bedroom estate features a resort-style pool, smart home technology, "
            "and breathtaking hill country views. At 750 thousand, it offers "
            "exceptional value for a property of this caliber. When would you like to see it?"
        )
    elif any(word in message_lower for word in ['bedrooms', 'beds', 'bedroom']):
        if '2' in message_lower or 'two' in message_lower:
            return (
                "For 2-bedroom properties, I'd recommend 456 Oak Avenue. "
                "It's a beautifully renovated condo at 325 thousand with modern finishes "
                "and a great location. Would you like more details?"
            )
        elif '3' in message_lower or 'three' in message_lower:
            return (
                "For 3 bedrooms, 123 Main Street would be perfect. "
                "It's in downtown Austin with hardwood floors throughout, "
                "priced at 489 thousand. Should I tell you more about it?"
            )
        elif '4' in message_lower or 'four' in message_lower:
            return (
                "For 4 bedrooms, you'll love 789 Pine Lane. "
                "It's our luxury listing with a pool and smart home features, "
                "priced at 750 thousand. Would you like to schedule a tour?"
            )
    elif any(word in message_lower for word in ['pool', 'swimming']):
        return (
            "If a pool is important to you, 789 Pine Lane is your best option. "
            "It has a beautiful resort-style pool with a spa, perfect for "
            "Austin summers. The home is priced at 750 thousand. "
            "Would you like to see it this week?"
        )
    elif any(word in message_lower for word in ['price', 'cost', 'budget', 'afford']):
        return (
            "We have excellent options across different price points. "
            "456 Oak Avenue at 325 thousand for a modern condo, "
            "123 Main Street at 489 thousand for a downtown home, "
            "and 789 Pine Lane at 750 thousand for luxury living. "
            "What's your ideal price range?"
        )
    elif any(word in message_lower for word in ['schedule', 'showing', 'tour', 'visit', 'see']):
        return (
            "I'd be delighted to schedule a showing for you! "
            "I have availability tomorrow afternoon or Thursday morning. "
            "Which property would you like to see first, and what time works best for you?"
        )
    elif any(word in message_lower for word in ['location', 'where', 'area', 'neighborhood']):
        return (
            "All three properties are in excellent Austin neighborhoods. "
            "123 Main Street is right downtown, perfect for city living. "
            "456 Oak Avenue is in a quiet residential area with great schools. "
            "789 Pine Lane offers hill country views with easy highway access. "
            "Which location appeals to you most?"
        )
    elif 'thank' in message_lower or 'bye' in message_lower or 'goodbye' in message_lower:
        return (
            "It's been my pleasure helping you today! "
            "Please don't hesitate to call back anytime. "
            "I'm here to help you find your perfect home. Have a wonderful day!"
        )
    else:
        return (
            "I'd love to help you find the perfect property! "
            "We have three beautiful homes available right now. "
            "A modern condo at 325 thousand, a downtown home at 489 thousand, "
            "and a luxury estate at 750 thousand. "
            "What features are most important to you in your next home?"
        )

@router.get("/test")
async def test_endpoint():
    """Test endpoint"""
    return {
        "status": "ready",
        "voice": "Amazon Polly (Joanna)",
        "quality": "High quality neural voice",
        "cost": "Included with Twilio"
    }