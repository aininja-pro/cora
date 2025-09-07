"""
Twilio Inbound SMS Webhooks
Handle STOP/HELP/other inbound SMS messages for compliance.
"""
from fastapi import APIRouter, Form, Request
from fastapi.responses import PlainTextResponse
from typing import Optional
import logging
import re
import asyncio
import aiohttp
from ..services.supabase_service import supabase_service
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/twilio", tags=["twilio-inbound"])

# Use singleton Supabase client for opt-out management
supabase = supabase_service.client


def normalize_phone_number(phone: str) -> str:
    """Normalize phone number for database lookups."""
    # Remove all non-digits except +
    normalized = re.sub(r'[^\d+]', '', phone)
    
    # Ensure it starts with +1 for US numbers
    if normalized.startswith('1') and len(normalized) == 11:
        normalized = '+' + normalized
    elif normalized.startswith('+1'):
        pass  # Already correct
    elif len(normalized) == 10:
        normalized = '+1' + normalized
    
    return normalized


async def set_contact_opt_out(phone: str, opted_out: bool = True):
    """Set SMS opt-out status for a contact."""
    try:
        normalized_phone = normalize_phone_number(phone)
        
        # Try to update existing contact
        result = supabase.table("contacts").update({
            "sms_opt_out": opted_out
        }).eq("phone", normalized_phone).execute()
        
        # If no contact found, create one
        if not result.data:
            supabase.table("contacts").insert({
                "phone": normalized_phone,
                "sms_opt_out": opted_out,
                "source": "sms_inbound",
                "created_at": "now()"
            }).execute()
        
        logger.info(f"Set SMS opt-out={opted_out} for {normalized_phone[:8]}...")
        
    except Exception as e:
        logger.error(f"Failed to update contact opt-out status: {e}")


def generate_help_message() -> str:
    """Generate standardized HELP response message."""
    return ("CORA SMS: Reply STOP to opt out. For support, visit https://cora.ai/help or call customer service. "
            "Msg & data rates may apply.")


def is_stop_message(body: str) -> bool:
    """Check if message is a STOP variant."""
    stop_keywords = {
        'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'stop all',
        'remove', 'opt out', 'optout', 'no more', 'unsub'
    }
    
    normalized_body = body.lower().strip()
    return normalized_body in stop_keywords


def is_help_message(body: str) -> bool:
    """Check if message is a HELP variant."""
    help_keywords = {'help', 'info', 'support', 'assistance', '?'}
    
    normalized_body = body.lower().strip()
    return normalized_body in help_keywords


@router.post("/sms-inbound")
async def handle_inbound_sms(
    request: Request,
    From: str = Form(...),
    To: Optional[str] = Form(None),
    Body: Optional[str] = Form(""),
    MessageSid: Optional[str] = Form(None),
    AccountSid: Optional[str] = Form(None)
):
    """
    Handle inbound SMS messages from Twilio webhook.
    
    Processes STOP, HELP, and other inbound SMS for compliance.
    Must respond with TwiML or empty response within 10 seconds.
    """
    try:
        # Log the inbound message (truncate PII)
        logger.info(f"Inbound SMS: from={From[:8]}..., body='{Body[:50]}...', sid={MessageSid}")
        
        # Normalize sender number
        sender_phone = normalize_phone_number(From)
        message_body = (Body or "").strip()
        
        # Handle STOP messages
        if is_stop_message(message_body):
            await set_contact_opt_out(sender_phone, opted_out=True)
            
            # Log system event for compliance
            logger.info(f"STOP processed: {sender_phone[:8]}... opted out via SMS")
            
            # Optional: Send confirmation (some carriers require this)
            response_text = "You have been unsubscribed from CORA SMS. You will not receive further messages."
            
            # Return TwiML response
            twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{response_text}</Message>
</Response>"""
            return PlainTextResponse(content=twiml, media_type="application/xml")
        
        # Handle HELP messages  
        elif is_help_message(message_body):
            help_text = generate_help_message()
            
            logger.info(f"HELP processed: {sender_phone[:8]}...")
            
            # Return TwiML with help message
            twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{help_text}</Message>
</Response>"""
            return PlainTextResponse(content=twiml, media_type="application/xml")
        
        # Handle START/UNSTOP (opt back in)
        elif message_body.lower().strip() in ['start', 'unstop', 'yes', 'subscribe']:
            await set_contact_opt_out(sender_phone, opted_out=False)
            
            logger.info(f"START processed: {sender_phone[:8]}... opted back in")
            
            response_text = "You have been re-subscribed to CORA SMS notifications. Reply STOP to opt out anytime."
            
            twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{response_text}</Message>
</Response>"""
            return PlainTextResponse(content=twiml, media_type="application/xml")
        
        # Handle other messages (confirmation responses, etc.)
        else:
            logger.info(f"Unrecognized inbound SMS: {sender_phone[:8]}..., body='{message_body[:30]}...'")
            
            # For MVP, just log and return empty response (no auto-reply)
            # TODO: Add logic for "C" (confirm), "R" (reschedule) responses
            return PlainTextResponse(content="<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Response></Response>", 
                                   media_type="application/xml")
    
    except Exception as e:
        logger.error(f"Inbound SMS webhook error: {e}")
        
        # Always return valid TwiML even on error to avoid Twilio retries
        return PlainTextResponse(content="<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Response></Response>", 
                               media_type="application/xml")


@router.post("/status")
async def twilio_status_callback(
    request: Request,
    CallSid: str = Form(...),
    CallStatus: str = Form(...),
    From: Optional[str] = Form(None),
    To: Optional[str] = Form(None),
    CallDuration: Optional[str] = Form(None)
):
    """
    Twilio status callback webhook - most reliable call-end detection.
    Triggers call cleanup and SMS notifications when CallStatus=completed.
    """
    try:
        logger.info(f"Twilio status callback: CallSid={CallSid}, Status={CallStatus}, Duration={CallDuration}s")
        
        if CallStatus == "completed":
            # Trigger call cleanup via voice server
            voice_server_url = "http://localhost:3000"
            
            try:
                # Notify voice server that call completed
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{voice_server_url}/cleanup-call",
                        json={
                            'callSid': CallSid,
                            'reason': 'status-callback',
                            'duration': CallDuration
                        }
                    ) as response:
                        if response.status == 200:
                            logger.info(f"✅ Call cleanup triggered for {CallSid} via status callback")
                        else:
                            logger.error(f"❌ Failed to trigger cleanup for {CallSid}: {response.status}")
                            
            except Exception as e:
                logger.error(f"❌ Error triggering call cleanup: {e}")
        
        # Always return 200 OK to Twilio
        return PlainTextResponse(content="OK", status_code=200)
        
    except Exception as e:
        logger.error(f"Status callback error: {e}")
        return PlainTextResponse(content="OK", status_code=200)


@router.get("/sms-inbound/health")
async def inbound_health_check():
    """Health check for inbound SMS webhook."""
    return {
        "service": "twilio_inbound_sms",
        "status": "healthy",
        "supabase_configured": bool(supabase.url)
    }