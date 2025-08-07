from fastapi import APIRouter, Request, HTTPException, Depends
from typing import Dict, Any
import json
import logging
from ..services.call_handler import CallHandler
from ..deps.auth import verify_synthflow_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

@router.post("/webhook")
async def synthflow_webhook(
    request: Request,
    payload: Dict[str, Any],
    verified: bool = Depends(verify_synthflow_webhook)
):
    """
    Handle incoming webhooks from Synthflow for real-time call processing.
    
    Flow:
    1. Synthflow sends caller's transcribed speech
    2. We process through GPT-4 with property context
    3. Return response for Synthflow to speak via TTS
    """
    try:
        # Extract call details
        call_id = payload.get("call_id", payload.get("call", {}).get("id", "unknown"))
        
        # Try different possible message fields from Synthflow
        caller_message = (
            payload.get("message") or 
            payload.get("transcript") or 
            payload.get("user", {}).get("message") or
            payload.get("call", {}).get("transcript") or
            ""
        )
        
        caller_phone = (
            payload.get("from_number") or 
            payload.get("phone_number") or
            payload.get("user", {}).get("phone_number") or
            payload.get("call", {}).get("from") or
            None
        )
        
        # Extract property reference from the message itself if mentioned
        property_reference = None
        if caller_message:
            # Look for addresses in the message
            import re
            # Try multiple patterns
            patterns = [
                r'\d+\s+\w+\s+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr)',  # With street type
                r'(?:property at|listing for|interested in)\s+(.+?)(?:\.|,|$)',  # After keywords
                r'\d+\s+\w+\s+\w+',  # Simple pattern like "123 Main Street"
            ]
            
            for pattern in patterns:
                match = re.search(pattern, caller_message.lower())
                if match:
                    if match.lastindex:  # Has capture group
                        property_reference = match.group(1).strip()
                    else:
                        property_reference = match.group().strip()
                    break
        
        # Log everything for debugging
        logger.info("="*50)
        logger.info(f"Full Synthflow payload: {json.dumps(payload, indent=2)}")
        logger.info(f"Extracted - Call ID: {call_id}")
        logger.info(f"Extracted - Message: {caller_message}")
        logger.info(f"Extracted - Property: {property_reference}")
        logger.info(f"Extracted - Phone: {caller_phone}")
        logger.info("="*50)
        
        # Initialize call handler
        call_handler = CallHandler()
        
        # Process the caller's message and generate response
        response = await call_handler.process_caller_message(
            call_id=call_id,
            caller_message=caller_message,
            caller_phone=caller_phone,
            property_reference=property_reference
        )
        
        # Save call to database for frontend to display
        try:
            # Use the basic columns that exist in the database
            call_data = {
                'phone_number': caller_phone or 'Unknown',
                'transcript': caller_message or 'No transcript',
                'status': 'completed',
                'duration': 0  # Will be updated when call ends
            }
            
            # Try to add optional columns if they exist
            try:
                call_data['ai_response'] = response["message"]
                call_data['property_mentioned'] = property_reference
                call_data['lead_score'] = 75 if property_reference else 50
            except:
                pass
            
            result = call_handler.supabase.table('calls').insert(call_data).execute()
            logger.info(f"Call saved to database: {result}")
        except Exception as e:
            logger.error(f"Error saving call to database: {str(e)}")
        
        # Return response for Synthflow to speak
        return {
            "success": True,
            "response": response["message"],
            "actions": response.get("actions", []),
            "metadata": {
                "call_id": call_id,
                "property_reference": property_reference
            }
        }
        
    except Exception as e:
        logger.error(f"Error processing Synthflow webhook: {str(e)}")
        # Return a graceful error response that Synthflow can speak
        return {
            "success": False,
            "response": "I'm having a bit of trouble right now. Could you please repeat that?",
            "error": str(e)
        }

@router.post("/call-ended")
async def call_ended_webhook(
    request: Request,
    payload: Dict[str, Any],
    verified: bool = Depends(verify_synthflow_webhook)
):
    """Handle call ended notifications from Synthflow."""
    try:
        call_id = payload.get("call_id")
        duration = payload.get("duration")
        recording_url = payload.get("recording_url")
        
        logger.info(f"Call ended - ID: {call_id}, Duration: {duration}s")
        
        # TODO: Save call record to database
        # TODO: Trigger any post-call actions (follow-up email, etc.)
        
        return {"success": True, "message": "Call record saved"}
        
    except Exception as e:
        logger.error(f"Error processing call ended webhook: {str(e)}")
        return {"success": False, "error": str(e)}