"""
Twilio ConversationRelay with ElevenLabs integration
Official way to use ElevenLabs with Twilio
"""

from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import Response
import logging
import os
from datetime import datetime
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio-relay", tags=["twilio-conversation-relay"])

# Store active calls for tracking
active_calls = {}

# ElevenLabs Voice IDs for ConversationRelay
ELEVENLABS_VOICES = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",     # Professional female
    "adam": "pNInz6obpgDQGcFmaJgB",       # Deep male
    "bella": "EXAVITQu4vr4xnSDxMaL",      # Soft female
    "antoni": "ErXwobaYiN019PkySvjV",     # Well-rounded male
    "amelia": "ZF6FPAbjXT4488VcRRnw",     # British female
}

# ElevenLabs models - Using exact IDs from Twilio documentation
MODELS = {
    "flash": "flash_v2_5",      # Fastest, lowest latency (default)
    "turbo": "turbo_v2_5",      # Better quality, slightly more latency
    "standard": "eleven_monolingual_v1",  # High quality
}

@router.get("/twiml")
async def handle_twiml_get(request: Request):
    """
    Handle incoming call using ConversationRelay with ElevenLabs
    This matches the Twilio tutorial exactly - GET request to /twiml
    """
    try:
        # Get query parameters from GET request
        from_number = request.query_params.get('From', 'Unknown')
        from_city = request.query_params.get('FromCity', 'Unknown')
        from_state = request.query_params.get('FromState', 'Unknown')
        
        logger.info(f"📞 Incoming call from {from_number} ({from_city}, {from_state})")
        
        # Get base URL for WebSocket
        # Render uses HTTPS, so WebSocket should be WSS
        base_url = "wss://cora-backend-epv0.onrender.com"
        websocket_url = f"{base_url}/api/twilio-relay/ws"  # Using /ws like the tutorial
        
        # Configure ElevenLabs voice with ConversationRelay
        # Format: VoiceID-Model-Speed_Stability_Similarity
        # Using Rachel voice with flash model for best performance
        voice_config = f"{ELEVENLABS_VOICES['rachel']}-{MODELS['flash']}-1.0_0.8_0.8"
        
        # Create TwiML with ConversationRelay - exactly like the tutorial
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
        # Fallback to simple response
        error_twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I apologize for the technical difficulty. Please try again later.</Say>
</Response>"""
        return Response(content=error_twiml, media_type="application/xml")

# Also support POST for compatibility
@router.post("/voice")
async def handle_voice_with_relay(request: Request):
    """
    POST version for backward compatibility
    """
    return await handle_twiml_get(request)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for ConversationRelay
    Handles real-time conversation between Twilio and AI
    """
    await websocket.accept()
    
    call_sid = None
    transcript = []
    
    try:
        logger.info("WebSocket connection established for ConversationRelay")
        
        # Try to save call info if database is available
        try:
            from ..services.supabase_service import SupabaseService
            db = SupabaseService()
            logger.info("Database service initialized for call tracking")
        except Exception as e:
            logger.warning(f"Database not available for call tracking: {e}")
            db = None
        
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
                call_sid = data.get("callSid", "unknown")
                
                # Try to create call record in database
                if db and call_sid:
                    try:
                        call_record = await db.create_call(
                            phone_number=data.get("from", "unknown"),
                            call_sid=call_sid,
                            direction="inbound"
                        )
                        active_calls[call_sid] = {
                            "id": call_record.get("id"),
                            "phone": data.get("from", "unknown")
                        }
                        logger.info(f"Call record created: {call_record.get('id')}")
                    except Exception as e:
                        logger.warning(f"Could not create call record: {e}")
                
                # Send ready signal
                await websocket.send_text(json.dumps({
                    "type": "setup",
                    "status": "ready"
                }))
                
            elif event_type == "prompt":
                # User spoke something
                user_message = data.get("voicePrompt", "")
                logger.info(f"User said: {user_message}")
                
                # Add to transcript
                transcript.append({"speaker": "user", "message": user_message})
                
                # Save to database if available
                if db and call_sid in active_calls:
                    try:
                        await db.add_transcript_entry(
                            call_id=active_calls[call_sid]["id"],
                            speaker="user",
                            message=user_message,
                            sequence_number=len(transcript)
                        )
                    except Exception as e:
                        logger.warning(f"Could not save transcript: {e}")
                
                # Use hybrid response service (instant for common queries, GPT for complex)
                try:
                    from ..services.response_service import ResponseService
                    response_service = ResponseService()
                    
                    # Get caller info if available
                    caller_info = {
                        "phone": call_sid and active_calls.get(call_sid, {}).get("phone", "unknown"),
                        "call_sid": call_sid
                    }
                    
                    response_text, extracted_info, used_gpt = await response_service.get_response(
                        user_message=user_message,
                        conversation_history=transcript,
                        caller_info=caller_info
                    )
                    
                    # Log whether we used GPT or gave instant response
                    if used_gpt:
                        logger.info(f"Used GPT-4 for: {user_message[:50]}...")
                    else:
                        logger.info(f"Instant response for: {user_message[:50]}...")
                    
                    # Log and save extracted information
                    if extracted_info:
                        logger.info(f"GPT extracted info: {extracted_info}")
                        
                        # Store extracted info for later use
                        if call_sid not in active_calls:
                            active_calls[call_sid] = {}
                        if "extracted_info" not in active_calls[call_sid]:
                            active_calls[call_sid]["extracted_info"] = []
                        active_calls[call_sid]["extracted_info"].append(extracted_info)
                        
                        # Save property inquiries and lead info to database if available
                        if db and call_sid in active_calls:
                            try:
                                # Save property inquiry if mentioned
                                if extracted_info.get("property_interest"):
                                    await db.track_property_inquiry(
                                        call_id=active_calls[call_sid]["id"],
                                        property_address=extracted_info["property_interest"],
                                        interest_level=extracted_info.get("interest_level", "medium")
                                    )
                                
                                # Save lead information
                                lead_data = {}
                                if extracted_info.get("budget_mentioned"):
                                    lead_data["budget_range_max"] = extracted_info["budget_mentioned"]
                                if extracted_info.get("bedrooms_wanted"):
                                    lead_data["desired_bedrooms"] = extracted_info["bedrooms_wanted"]
                                
                                if lead_data:
                                    # Get phone number from active call data
                                    phone = active_calls[call_sid]["phone"]
                                    await db.capture_lead(
                                        call_id=active_calls[call_sid]["id"],
                                        phone_number=phone,
                                        **lead_data
                                    )
                                    
                            except Exception as e:
                                logger.warning(f"Could not save extracted info to database: {e}")
                    
                except Exception as e:
                    logger.warning(f"Response service failed, using basic fallback: {str(e)}")
                    response_text = generate_property_response(user_message)
                    extracted_info = {}
                
                # Add assistant response to transcript
                transcript.append({"speaker": "assistant", "message": response_text})
                
                # Save assistant response to database if available
                if db and call_sid in active_calls:
                    try:
                        await db.add_transcript_entry(
                            call_id=active_calls[call_sid]["id"],
                            speaker="assistant",
                            message=response_text,
                            sequence_number=len(transcript)
                        )
                    except Exception as e:
                        logger.warning(f"Could not save transcript: {e}")
                
                # Send response back to Twilio
                # ConversationRelay handles the TTS with ElevenLabs automatically
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
                
                # Save final transcript to database if available
                if db and call_sid in active_calls:
                    try:
                        full_transcript = "\n".join([
                            f"{t['speaker'].upper()}: {t['message']}"
                            for t in transcript
                        ])
                        await db.end_call(
                            call_id=active_calls[call_sid]["id"],
                            transcript=full_transcript
                        )
                        logger.info(f"Call data saved for {call_sid}")
                        
                        # Auto-analyze calls with substantive conversations
                        if len(transcript) >= 4:  # Only analyze calls with real conversations
                            try:
                                from ..services.call_analysis_service import CallAnalysisService
                                analysis_service = CallAnalysisService()
                                
                                # Get transcript entries for analysis
                                transcript_entries = []
                                for i, entry in enumerate(transcript):
                                    transcript_entries.append({
                                        "speaker": entry["speaker"],
                                        "message": entry["message"],
                                        "timestamp": entry.get("timestamp", datetime.utcnow().isoformat()),
                                        "sequence_number": i + 1
                                    })
                                
                                analysis = await analysis_service.analyze_call_transcript(transcript_entries)
                                
                                # Update call record with analysis results
                                if analysis.get("caller_name"):
                                    await db.update_call(active_calls[call_sid]["id"], {
                                        "caller_name": analysis["caller_name"]
                                    })
                                
                                logger.info(f"Auto-analyzed call {call_sid}: {analysis.get('caller_name', 'No name')} - {analysis.get('lead_quality', 'unknown')} lead")
                                
                            except Exception as e:
                                logger.warning(f"Auto-analysis failed for {call_sid}: {e}")
                        
                    except Exception as e:
                        logger.warning(f"Could not save final call data: {e}")
                
                break
                
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        try:
            await websocket.close()
        except:
            pass

def generate_property_response(user_message: str) -> str:
    """
    Generate contextual property responses
    In production, this would use GPT-4 or another LLM
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
    
    # Property inquiries
    elif '123 main' in message_lower or 'main street' in message_lower:
        return (
            "Oh, you're interested in 123 Main Street! That's one of my favorites. "
            "It's a stunning 3-bedroom home with beautiful hardwood floors and granite countertops. "
            "The kitchen was just renovated last year. At 489 thousand, it's perfectly priced "
            "for the downtown Austin market. Would you like to schedule a private showing this week?"
        )
    
    elif '456 oak' in message_lower or 'oak avenue' in message_lower:
        return (
            "456 Oak Avenue is a fantastic choice! It's a modern 2-bedroom condo "
            "that was just renovated last year. At 325 thousand, it's ideal for "
            "first-time buyers or anyone looking for a low-maintenance lifestyle. "
            "The HOA covers all exterior maintenance and landscaping. "
            "I can arrange a tour as early as tomorrow if you'd like."
        )
    
    elif '789 pine' in message_lower or 'pine lane' in message_lower:
        return (
            "Excellent taste! 789 Pine Lane is our premier luxury listing. "
            "This 4-bedroom estate features a resort-style pool, smart home technology, "
            "and breathtaking hill country views. The master suite alone is 800 square feet. "
            "At 750 thousand, it offers exceptional value for a property of this caliber. "
            "When would you like to see it?"
        )
    
    # Feature inquiries
    elif any(word in message_lower for word in ['bedrooms', 'beds', 'bedroom']):
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
    
    # Pool inquiry
    elif any(word in message_lower for word in ['pool', 'swimming']):
        return (
            "If a pool is important to you, 789 Pine Lane is your best option. "
            "It has a beautiful resort-style pool with a spa and waterfall feature, "
            "perfect for Austin summers. The pool area also has an outdoor kitchen. "
            "The home is priced at 750 thousand. Would you like to see it this week?"
        )
    
    # Price/budget inquiry
    elif any(word in message_lower for word in ['price', 'cost', 'budget', 'afford', 'expensive', 'cheap']):
        return (
            "We have excellent options across different price points. "
            "Starting at 325 thousand for a modern 2-bedroom condo on Oak Avenue, "
            "489 thousand for a charming 3-bedroom home on Main Street, "
            "and 750 thousand for a luxury 4-bedroom estate on Pine Lane. "
            "What's your ideal price range? I can also look for other properties that might fit your budget."
        )
    
    # Scheduling inquiry
    elif any(word in message_lower for word in ['schedule', 'showing', 'tour', 'visit', 'see', 'appointment']):
        return (
            "I'd be delighted to schedule a showing for you! "
            "I have availability tomorrow afternoon, Thursday morning, or this weekend. "
            "Which property would you like to see first, and what time works best for you? "
            "I can also arrange virtual tours if you prefer to start there."
        )
    
    # Location inquiry
    elif any(word in message_lower for word in ['location', 'where', 'area', 'neighborhood', 'school']):
        return (
            "All three properties are in excellent Austin neighborhoods. "
            "123 Main Street is right downtown, walking distance to restaurants and entertainment. "
            "456 Oak Avenue is in a quiet residential area with top-rated schools nearby. "
            "789 Pine Lane offers hill country views with easy access to Highway 71. "
            "Which location appeals to you most? I can tell you more about any of these areas."
        )
    
    # Thank you / Goodbye
    elif any(word in message_lower for word in ['thank', 'thanks', 'bye', 'goodbye', 'take care']):
        return (
            "It's been my absolute pleasure helping you today! "
            "Please don't hesitate to call back anytime - I'm here to help you find your perfect home. "
            "If you'd like, I can also send you detailed information about any of these properties by email. "
            "Have a wonderful day!"
        )
    
    # Default response
    else:
        return (
            "That's a great question! Let me help you with that. "
            "We currently have three beautiful properties available: "
            "a 2-bedroom condo, a 3-bedroom family home, and a 4-bedroom luxury estate. "
            "What specific features or amenities are most important to you in your next home?"
        )

@router.get("/test")
async def test_endpoint():
    """Test endpoint"""
    return {
        "status": "ready",
        "method": "ConversationRelay",
        "tts": "ElevenLabs",
        "stt": "Deepgram",
        "voices": list(ELEVENLABS_VOICES.keys()),
        "models": list(MODELS.keys())
    }

@router.post("/simple")
async def simple_elevenlabs_relay(request: Request):
    """
    Simplified version without WebSocket - just basic ConversationRelay
    """
    try:
        # Use Rachel voice with turbo model for best balance
        voice_config = f"{ELEVENLABS_VOICES['rachel']}-{MODELS['turbo']}-1.0_0.5_0.75"
        
        # Simple TwiML with just greeting
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Connecting you to Cora with ElevenLabs voice.</Say>
    <Connect>
        <ConversationRelay 
            ttsProvider="ElevenLabs"
            voice="{voice_config}"
            elevenlabsTextNormalization="on"
            welcomeGreeting="Hello! This is Cora from your real estate team. I have a natural ElevenLabs voice now. How can I help you find your dream home today?"
        />
    </Connect>
</Response>"""
        
        return Response(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        fallback = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Technical difficulty. Please try again.</Say>
</Response>"""
        return Response(content=fallback, media_type="application/xml")