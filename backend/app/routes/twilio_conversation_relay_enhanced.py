"""
Enhanced Twilio ConversationRelay with call data capture and Supabase integration
"""

from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import Response
import logging
import os
from datetime import datetime
import json
import re
from typing import Optional, Dict, Any, List
from ..services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio-relay", tags=["twilio-conversation-relay"])

# ElevenLabs Voice IDs for ConversationRelay
ELEVENLABS_VOICES = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",     # Professional female
    "adam": "pNInz6obpgDQGcFmaJgB",       # Deep male
    "bella": "EXAVITQu4vr4xnSDxMaL",      # Soft female
    "antoni": "ErXwobaYiN019PkySvjV",     # Well-rounded male
    "amelia": "ZF6FPAbjXT4488VcRRnw",     # British female
}

# ElevenLabs models
MODELS = {
    "flash": "flash_v2_5",      # Fastest, lowest latency (default)
    "turbo": "turbo_v2_5",      # Better quality, slightly more latency
    "standard": "eleven_monolingual_v1",  # High quality
}

# Property database (temporary - will be replaced with Supabase)
PROPERTIES = {
    "123 Main Street": {
        "address": "123 Main Street",
        "price": 489000,
        "bedrooms": 3,
        "bathrooms": 2,
        "type": "house",
        "features": ["hardwood floors", "granite countertops", "renovated kitchen", "backyard"]
    },
    "456 Oak Avenue": {
        "address": "456 Oak Avenue",
        "price": 325000,
        "bedrooms": 2,
        "bathrooms": 1.5,
        "type": "condo",
        "features": ["modern", "renovated", "low maintenance", "HOA included"]
    },
    "789 Pine Lane": {
        "address": "789 Pine Lane",
        "price": 750000,
        "bedrooms": 4,
        "bathrooms": 3,
        "type": "house",
        "features": ["pool", "luxury", "smart home", "hill country views", "three-car garage"]
    }
}

class CallSession:
    """Manages a single call session with transcript and data capture"""
    
    def __init__(self, call_sid: str, phone_number: str, caller_city: str, caller_state: str):
        self.call_sid = call_sid
        self.phone_number = phone_number
        self.caller_city = caller_city
        self.caller_state = caller_state
        self.call_id: Optional[str] = None
        self.transcript_sequence = 0
        self.full_transcript = []
        self.properties_discussed = set()
        self.lead_info = {}
        try:
            self.supabase = SupabaseService()
        except Exception as e:
            logger.error(f"Failed to initialize Supabase service: {str(e)}")
            self.supabase = None
        self.start_time = datetime.utcnow()
    
    async def initialize(self):
        """Create initial call record in database"""
        if not self.supabase:
            logger.warning("Supabase not available, skipping call record creation")
            self.call_id = None
            return False
            
        try:
            call_record = await self.supabase.create_call(
                phone_number=self.phone_number,
                call_sid=self.call_sid,
                direction="inbound",
                caller_city=self.caller_city,
                caller_state=self.caller_state
            )
            self.call_id = call_record["id"]
            logger.info(f"Initialized call session: {self.call_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize call session: {str(e)}")
            # Don't fail the whole call just because DB isn't working
            self.call_id = None
            return False
    
    async def add_user_message(self, message: str):
        """Add user message to transcript"""
        self.transcript_sequence += 1
        self.full_transcript.append({
            "speaker": "user",
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        if self.call_id and self.supabase:
            try:
                await self.supabase.add_transcript_entry(
                    call_id=self.call_id,
                    speaker="user",
                    message=message,
                    sequence_number=self.transcript_sequence
                )
            except Exception as e:
                logger.error(f"Failed to save user message: {str(e)}")
        
        # Extract property mentions and lead info
        await self.extract_property_mentions(message)
        await self.extract_lead_info(message)
    
    async def add_assistant_message(self, message: str):
        """Add assistant message to transcript"""
        self.transcript_sequence += 1
        self.full_transcript.append({
            "speaker": "assistant",
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        if self.call_id and self.supabase:
            try:
                await self.supabase.add_transcript_entry(
                    call_id=self.call_id,
                    speaker="assistant",
                    message=message,
                    sequence_number=self.transcript_sequence
                )
            except Exception as e:
                logger.error(f"Failed to save assistant message: {str(e)}")
    
    async def extract_property_mentions(self, message: str):
        """Extract property mentions from user message"""
        message_lower = message.lower()
        
        for address, details in PROPERTIES.items():
            # Check for various ways the property might be mentioned
            address_lower = address.lower()
            street_name = address_lower.split()[1] if len(address_lower.split()) > 1 else ""
            
            if address_lower in message_lower or street_name in message_lower:
                if address not in self.properties_discussed:
                    self.properties_discussed.add(address)
                    
                    # Determine interest level based on keywords
                    interest_level = "medium"
                    if any(word in message_lower for word in ["love", "perfect", "amazing", "definitely", "schedule"]):
                        interest_level = "very_high"
                    elif any(word in message_lower for word in ["interested", "like", "nice", "good"]):
                        interest_level = "high"
                    elif any(word in message_lower for word in ["maybe", "possibly", "not sure"]):
                        interest_level = "medium"
                    elif any(word in message_lower for word in ["no", "not interested", "too expensive"]):
                        interest_level = "low"
                    
                    if self.call_id and self.supabase:
                        try:
                            await self.supabase.track_property_inquiry(
                                call_id=self.call_id,
                                property_address=address,
                                property_type=details["type"],
                                price=details["price"],
                                bedrooms=details["bedrooms"],
                                bathrooms=details["bathrooms"],
                                features=details["features"],
                                interest_level=interest_level
                            )
                            logger.info(f"Tracked property inquiry: {address} (interest: {interest_level})")
                        except Exception as e:
                            logger.error(f"Failed to track property inquiry: {str(e)}")
    
    async def extract_lead_info(self, message: str):
        """Extract lead information from conversation"""
        message_lower = message.lower()
        
        # Extract budget mentions
        budget_patterns = [
            r"budget.*?(\d+)k",
            r"(\d+)k.*?budget",
            r"around.*?(\d+).*?thousand",
            r"up to.*?(\d+)",
        ]
        
        for pattern in budget_patterns:
            match = re.search(pattern, message_lower)
            if match:
                budget = int(match.group(1)) * 1000
                self.lead_info["budget_max"] = budget
                logger.info(f"Extracted budget: ${budget}")
        
        # Extract bedroom preferences
        bedroom_patterns = [
            r"(\d+)\s*bedroom",
            r"(\d+)\s*bed",
            r"(\d+)\s*br",
        ]
        
        for pattern in bedroom_patterns:
            match = re.search(pattern, message_lower)
            if match:
                bedrooms = int(match.group(1))
                self.lead_info["desired_bedrooms"] = bedrooms
                logger.info(f"Extracted bedroom preference: {bedrooms}")
        
        # Extract timeline
        timeline_keywords = {
            "asap": "immediate",
            "immediately": "immediate",
            "this week": "1 week",
            "next week": "1-2 weeks",
            "this month": "1 month",
            "next month": "1-2 months",
            "few months": "2-3 months",
            "next year": "6-12 months"
        }
        
        for keyword, timeline in timeline_keywords.items():
            if keyword in message_lower:
                self.lead_info["timeline"] = timeline
                logger.info(f"Extracted timeline: {timeline}")
                break
        
        # Extract location preferences
        location_keywords = ["downtown", "suburbs", "near schools", "quiet area", "city center"]
        for keyword in location_keywords:
            if keyword in message_lower:
                self.lead_info["desired_location"] = keyword
                logger.info(f"Extracted location preference: {keyword}")
                break
    
    async def end_call(self):
        """End the call and save final data"""
        if self.call_id and self.supabase:
            try:
                # Calculate call duration
                duration = int((datetime.utcnow() - self.start_time).total_seconds())
                
                # Create full transcript text
                transcript_text = "\n".join([
                    f"{entry['speaker'].upper()}: {entry['message']}"
                    for entry in self.full_transcript
                ])
                
                # Update call record
                await self.supabase.end_call(
                    call_id=self.call_id,
                    duration=duration,
                    transcript=transcript_text
                )
                
                # Save lead information if we have any
                if self.lead_info:
                    await self.supabase.capture_lead(
                        call_id=self.call_id,
                        phone_number=self.phone_number,
                        **self.lead_info
                    )
                
                logger.info(f"Call ended: {self.call_id} (duration: {duration}s)")
                logger.info(f"Properties discussed: {self.properties_discussed}")
                logger.info(f"Lead info captured: {self.lead_info}")
                
            except Exception as e:
                logger.error(f"Failed to end call properly: {str(e)}")


# Store active call sessions
active_sessions: Dict[str, CallSession] = {}


@router.get("/twiml")
async def handle_twiml_get(request: Request):
    """
    Handle incoming call using ConversationRelay with ElevenLabs
    """
    try:
        # Get query parameters from GET request
        call_sid = request.query_params.get('CallSid', '')
        from_number = request.query_params.get('From', 'Unknown')
        from_city = request.query_params.get('FromCity', 'Unknown')
        from_state = request.query_params.get('FromState', 'Unknown')
        
        logger.info(f"📞 Incoming call from {from_number} ({from_city}, {from_state}) - SID: {call_sid}")
        
        # Get base URL for WebSocket
        base_url = "wss://cora-backend-epv0.onrender.com"
        
        # Include call parameters in WebSocket URL for session tracking
        import urllib.parse
        params = urllib.parse.urlencode({
            'call_sid': call_sid,
            'from': from_number,
            'city': from_city,
            'state': from_state
        })
        websocket_url = f"{base_url}/api/twilio-relay/ws?{params}"
        
        # Configure ElevenLabs voice with ConversationRelay
        voice_config = f"{ELEVENLABS_VOICES['rachel']}-{MODELS['flash']}-1.0_0.8_0.8"
        
        # Create TwiML with ConversationRelay
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay 
            url="{websocket_url}"
            ttsProvider="ElevenLabs"
            voice="{voice_config}"
            elevenlabsTextNormalization="on"
            welcomeGreeting="Hello! This is Cora from your real estate team. I'm here to help you find your dream property. What type of home are you looking for today?"
        />
    </Connect>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error in ConversationRelay handler: {str(e)}")
        error_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I apologize for the technical difficulty. Please try again later.</Say>
</Response>"""
        return Response(content=error_twiml, media_type="application/xml")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Enhanced WebSocket endpoint with call data capture
    """
    logger.info("WebSocket connection attempt received")
    await websocket.accept()
    
    session: Optional[CallSession] = None
    
    try:
        # Extract call parameters from query string
        params = websocket.url.query
        call_sid = params.get('call_sid', 'unknown')
        phone_number = params.get('from', 'unknown')
        caller_city = params.get('city', 'unknown')
        caller_state = params.get('state', 'unknown')
        
        logger.info(f"Creating session for call {call_sid} from {phone_number} ({caller_city}, {caller_state})")
        
        # Create call session
        try:
            session = CallSession(call_sid, phone_number, caller_city, caller_state)
            init_result = await session.initialize()
            active_sessions[call_sid] = session
            if init_result:
                logger.info(f"✅ Call session initialized successfully with DB: {session.call_id}")
            else:
                logger.warning(f"⚠️ Call session created but DB not available for {call_sid}")
        except Exception as e:
            logger.error(f"❌ Failed to create call session: {str(e)}")
            # Create a minimal session anyway
            session = None
        
        logger.info(f"WebSocket connection established for call {call_sid}")
        
        while True:
            # Receive message from Twilio
            message = await websocket.receive_text()
            
            # Parse the message
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse message: {message}")
                continue
            
            event_type = data.get("type")
            logger.info(f"Received event: {event_type}")
            
            if event_type == "setup":
                # Initial setup from Twilio
                logger.info(f"Setup received: {data}")
                # Send ready signal
                await websocket.send_text(json.dumps({
                    "type": "setup",
                    "status": "ready"
                }))
                
            elif event_type == "prompt":
                # User spoke something
                transcript = data.get("voicePrompt", "")
                logger.info(f"User said: {transcript}")
                
                # Save user message to transcript
                if session:
                    await session.add_user_message(transcript)
                
                # Generate response based on what user said
                response_text = await generate_enhanced_property_response(transcript, session)
                
                # Save assistant response to transcript
                if session:
                    await session.add_assistant_message(response_text)
                
                # Send response back to Twilio
                await websocket.send_text(json.dumps({
                    "type": "text",
                    "token": response_text
                }))
                
            elif event_type == "interrupt":
                # User interrupted the AI
                logger.info("User interrupted")
                await websocket.send_text(json.dumps({
                    "type": "interrupt",
                    "status": "acknowledged"
                }))
                
            elif event_type == "dtmf":
                # User pressed a key
                digit = data.get("digit")
                logger.info(f"User pressed: {digit}")
                
            elif event_type == "end":
                # Call ended
                logger.info("Call ended")
                if session:
                    await session.end_call()
                break
                
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        # Clean up session
        if session and session.call_sid in active_sessions:
            await session.end_call()
            del active_sessions[session.call_sid]
        
        try:
            await websocket.close()
        except:
            pass


async def generate_enhanced_property_response(user_message: str, session: Optional[CallSession] = None) -> str:
    """
    Generate contextual property responses with session awareness
    """
    if not user_message:
        return "I'm sorry, I didn't catch that. Could you please repeat?"
    
    message_lower = user_message.lower()
    
    # Greeting
    if any(word in message_lower for word in ['hello', 'hi', 'hey', 'good morning', 'good afternoon']):
        return (
            "Hello! I'm excited to help you find your perfect home. "
            "We have several beautiful properties available. "
            "Are you looking for something specific, like a certain number of bedrooms "
            "or a particular neighborhood?"
        )
    
    # Property inquiries - check all properties
    for address, details in PROPERTIES.items():
        address_lower = address.lower()
        street_name = address_lower.split()[1] if len(address_lower.split()) > 1 else ""
        
        if street_name in message_lower or any(part in message_lower for part in address_lower.split()):
            return generate_property_description(address, details)
    
    # Feature inquiries
    if any(word in message_lower for word in ['bedrooms', 'beds', 'bedroom']):
        return generate_bedroom_response(message_lower)
    
    # Pool inquiry
    if any(word in message_lower for word in ['pool', 'swimming']):
        return (
            "If a pool is important to you, 789 Pine Lane is your best option. "
            "It has a beautiful resort-style pool with a spa and waterfall feature, "
            "perfect for Austin summers. The pool area also has an outdoor kitchen. "
            "The home is priced at 750 thousand. Would you like to see it this week?"
        )
    
    # Price/budget inquiry
    if any(word in message_lower for word in ['price', 'cost', 'budget', 'afford', 'expensive', 'cheap']):
        return (
            "We have excellent options across different price points. "
            "Starting at 325 thousand for a modern 2-bedroom condo on Oak Avenue, "
            "489 thousand for a charming 3-bedroom home on Main Street, "
            "and 750 thousand for a luxury 4-bedroom estate on Pine Lane. "
            "What's your ideal price range? I can also look for other properties that might fit your budget."
        )
    
    # Scheduling inquiry
    if any(word in message_lower for word in ['schedule', 'showing', 'tour', 'visit', 'see', 'appointment']):
        response = (
            "I'd be delighted to schedule a showing for you! "
            "I have availability tomorrow afternoon, Thursday morning, or this weekend. "
            "Which property would you like to see first, and what time works best for you?"
        )
        
        # Check if they've discussed properties
        if session and session.properties_discussed:
            properties_list = ", ".join(session.properties_discussed)
            response += f" I see you're interested in {properties_list}. We can arrange to see all of them if you'd like."
        
        return response
    
    # Location inquiry
    if any(word in message_lower for word in ['location', 'where', 'area', 'neighborhood', 'school']):
        return (
            "All three properties are in excellent Austin neighborhoods. "
            "123 Main Street is right downtown, walking distance to restaurants and entertainment. "
            "456 Oak Avenue is in a quiet residential area with top-rated schools nearby. "
            "789 Pine Lane offers hill country views with easy access to Highway 71. "
            "Which location appeals to you most?"
        )
    
    # Thank you / Goodbye
    if any(word in message_lower for word in ['thank', 'thanks', 'bye', 'goodbye', 'take care']):
        return (
            "It's been my absolute pleasure helping you today! "
            "Please don't hesitate to call back anytime. "
            "If you'd like, I can also send you detailed information about any of these properties by email. "
            "Have a wonderful day!"
        )
    
    # Default response
    return (
        "That's a great question! Let me help you with that. "
        "We currently have three beautiful properties available: "
        "a 2-bedroom condo, a 3-bedroom family home, and a 4-bedroom luxury estate. "
        "What specific features or amenities are most important to you?"
    )


def generate_property_description(address: str, details: Dict[str, Any]) -> str:
    """Generate a detailed property description"""
    if address == "123 Main Street":
        return (
            "Oh, you're interested in 123 Main Street! That's one of my favorites. "
            "It's a stunning 3-bedroom, 2-bathroom home with beautiful hardwood floors and granite countertops. "
            "The kitchen was just renovated last year. At 489 thousand, it's perfectly priced "
            "for the downtown Austin market. Would you like to schedule a private showing this week?"
        )
    elif address == "456 Oak Avenue":
        return (
            "456 Oak Avenue is a fantastic choice! It's a modern 2-bedroom, one and a half bath condo "
            "that was just renovated last year. At 325 thousand, it's ideal for "
            "first-time buyers or anyone looking for a low-maintenance lifestyle. "
            "The HOA covers all exterior maintenance and landscaping. "
            "I can arrange a tour as early as tomorrow if you'd like."
        )
    elif address == "789 Pine Lane":
        return (
            "Excellent taste! 789 Pine Lane is our premier luxury listing. "
            "This 4-bedroom, 3-bathroom estate features a resort-style pool, smart home technology, "
            "and breathtaking hill country views. The master suite alone is 800 square feet. "
            "At 750 thousand, it offers exceptional value for a property of this caliber. "
            "When would you like to see it?"
        )
    else:
        return f"Let me tell you about {address}. It's priced at {details['price']} with {details['bedrooms']} bedrooms."


def generate_bedroom_response(message_lower: str) -> str:
    """Generate response based on bedroom inquiry"""
    if '2' in message_lower or 'two' in message_lower:
        return (
            "For 2-bedroom properties, I'd highly recommend 456 Oak Avenue. "
            "It's a beautifully renovated condo at 325 thousand with modern finishes, "
            "stainless steel appliances, and a great location near shopping and dining. "
            "Would you like more details about this property?"
        )
    elif '3' in message_lower or 'three' in message_lower:
        return (
            "For 3 bedrooms, 123 Main Street would be perfect for you. "
            "It's in the heart of downtown Austin with original hardwood floors throughout, "
            "a spacious backyard, and it's priced at 489 thousand. "
            "Should I tell you more about the neighborhood and schools?"
        )
    elif '4' in message_lower or 'four' in message_lower:
        return (
            "For 4 bedrooms, you'll absolutely love 789 Pine Lane. "
            "It's our luxury listing with a pool, three-car garage, and smart home features. "
            "The property sits on half an acre with mature trees. It's priced at 750 thousand. "
            "Would you like to schedule a tour?"
        )
    else:
        return (
            "We have homes ranging from cozy 2-bedroom condos to spacious 4-bedroom estates. "
            "Our 2-bedroom at Oak Avenue is 325 thousand, "
            "the 3-bedroom on Main Street is 489 thousand, "
            "and our luxury 4-bedroom on Pine Lane is 750 thousand. "
            "Which size would work best for your needs?"
        )


@router.get("/test")
async def test_endpoint():
    """Test endpoint"""
    return {
        "status": "ready",
        "method": "ConversationRelay with Call Capture",
        "tts": "ElevenLabs",
        "stt": "Deepgram",
        "database": "Supabase",
        "features": [
            "Call tracking",
            "Transcript capture",
            "Property inquiry tracking",
            "Lead capture",
            "Session management"
        ]
    }