"""
Twilio webhook routes - Handle incoming calls and speech
No Synthflow needed! Direct control over everything.
"""

from fastapi import APIRouter, Request, BackgroundTasks
from fastapi.responses import Response
from typing import Optional
import logging
from ..services.twilio_voice import TwilioVoiceService
from ..services.call_handler import CallHandler
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio", tags=["twilio"])

# Initialize services
twilio_service = TwilioVoiceService()
call_handler = CallHandler()

@router.post("/incoming-call")
async def handle_incoming_call(request: Request):
    """
    Webhook for incoming Twilio calls
    Twilio will POST here when someone calls your number
    """
    try:
        # Get form data from Twilio
        form_data = await request.form()
        form_dict = dict(form_data)
        
        # If form_data is empty, log the issue
        if not form_dict:
            logger.warning("Empty form data received from Twilio")
        
        # Log incoming call details
        logger.info("="*60)
        logger.info("📞 NEW INCOMING CALL")
        logger.info(f"From: {form_dict.get('From', 'Unknown')}")
        logger.info(f"City: {form_dict.get('FromCity', 'Unknown')}")
        logger.info(f"Call ID: {form_dict.get('CallSid', 'Unknown')}")
        logger.info("="*60)
        
        # Generate TwiML response
        twiml_response = twilio_service.handle_incoming_call(form_dict)
        
        # Return TwiML (XML) response
        return Response(
            content=twiml_response,
            media_type="application/xml"
        )
        
    except Exception as e:
        logger.error(f"Error handling incoming call: {str(e)}")
        # Return error message to caller
        error_twiml = """
        <Response>
            <Say voice="Polly.Joanna">
                I'm sorry, I'm having technical difficulties. 
                Please try calling back in a moment.
            </Say>
        </Response>
        """
        return Response(content=error_twiml, media_type="application/xml")

@router.post("/process-speech")
async def process_speech(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Process speech input from caller
    Twilio sends the transcribed speech here
    """
    try:
        # Get form data
        form_data = await request.form()
        form_dict = dict(form_data)
        
        # Extract key information
        call_sid = form_dict.get('CallSid', '')
        speech_result = form_dict.get('SpeechResult', '')
        confidence = form_dict.get('Confidence', '0')
        
        # Log what the caller said
        logger.info(f"💬 Speech received: '{speech_result}' (confidence: {confidence})")
        
        # Process with our enhanced call handler in background
        # This will use GPT-4 to generate intelligent responses
        background_tasks.add_task(
            process_with_ai,
            call_sid,
            speech_result,
            form_dict.get('From', '')
        )
        
        # Process with GPT-4 enhanced response
        twiml_response = await twilio_service.process_speech(form_dict)
        
        return Response(
            content=twiml_response,
            media_type="application/xml"
        )
        
    except Exception as e:
        logger.error(f"Error processing speech: {str(e)}")
        # Continue conversation despite error
        continue_twiml = """
        <Response>
            <Say voice="Polly.Joanna">
                I didn't quite catch that. Could you please repeat?
            </Say>
            <Gather input="speech" action="/api/twilio/process-speech" 
                    speechTimeout="auto" language="en-US">
            </Gather>
        </Response>
        """
        return Response(content=continue_twiml, media_type="application/xml")

@router.post("/call-status")
async def handle_call_status(request: Request):
    """
    Handle call status updates (call ended, failed, etc.)
    """
    try:
        form_data = await request.form()
        form_dict = dict(form_data)
        
        call_status = form_dict.get('CallStatus', '')
        call_sid = form_dict.get('CallSid', '')
        duration = form_dict.get('CallDuration', '0')
        
        logger.info(f"📊 Call status update: {call_status} for {call_sid} (duration: {duration}s)")
        
        # Handle call end
        if call_status in ['completed', 'failed', 'busy', 'no-answer']:
            result = twilio_service.end_call(form_dict)
            logger.info(f"Call ended: {result}")
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error handling call status: {str(e)}")
        return {"success": False, "error": str(e)}

@router.post("/recording-status")
async def handle_recording_status(request: Request):
    """
    Handle recording completion
    """
    try:
        form_data = await request.form()
        form_dict = dict(form_data)
        
        recording_url = form_dict.get('RecordingUrl', '')
        call_sid = form_dict.get('CallSid', '')
        
        if recording_url:
            logger.info(f"📼 Recording available for {call_sid}: {recording_url}")
            
            # Update database with recording URL
            try:
                twilio_service.supabase.table('calls').update({
                    'recording_url': recording_url
                }).eq('call_id', call_sid).execute()
            except Exception as e:
                logger.error(f"Error saving recording URL: {e}")
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error handling recording: {str(e)}")
        return {"success": False}

async def process_with_ai(call_sid: str, message: str, phone_number: str):
    """
    Background task to process message with GPT-4
    This will be enhanced to update the call in real-time
    """
    try:
        # Extract property reference if mentioned
        property_ref = None
        message_lower = message.lower()
        
        # Simple property extraction (we'll enhance this)
        if '123 main' in message_lower:
            property_ref = '123 Main Street'
        elif '456 oak' in message_lower:
            property_ref = '456 Oak Avenue'
        elif '789 pine' in message_lower:
            property_ref = '789 Pine Lane'
        
        # Process with existing call handler
        response = await call_handler.process_caller_message(
            call_id=call_sid,
            caller_message=message,
            caller_phone=phone_number,
            property_reference=property_ref
        )
        
        logger.info(f"AI Response generated: {response.get('message', '')[:100]}...")
        
        # In the future, we'll send this to the active call
        # For now, it's logged and saved to database
        
    except Exception as e:
        logger.error(f"Error processing with AI: {e}")

@router.get("/test-connection")
async def test_twilio_connection():
    """
    Test if Twilio is properly configured
    """
    if not twilio_service.client:
        return {
            "connected": False,
            "error": "Twilio credentials not configured",
            "instructions": "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to your .env file"
        }
    
    try:
        # Try to fetch account info
        account = twilio_service.client.api.accounts(
            twilio_service.account_sid
        ).fetch()
        
        # Get phone numbers
        numbers = twilio_service.client.incoming_phone_numbers.list(limit=5)
        
        return {
            "connected": True,
            "account_name": account.friendly_name,
            "account_status": account.status,
            "phone_numbers": [
                {
                    "number": num.phone_number,
                    "friendly_name": num.friendly_name,
                    "capabilities": {
                        "voice": num.capabilities.get('voice', False),
                        "sms": num.capabilities.get('sms', False)
                    }
                }
                for num in numbers
            ],
            "webhook_url": "Set your Twilio phone number webhook to: "
                          "https://your-domain.com/api/twilio/incoming-call"
        }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e)
        }

@router.post("/make-call")
async def make_outbound_call(
    phone_number: str,
    message: str = "Hello, this is Cora from your real estate team."
):
    """
    Make an outbound call
    """
    result = twilio_service.make_outbound_call(phone_number, message)
    return result