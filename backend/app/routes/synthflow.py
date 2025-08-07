from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any
import json
import logging
from datetime import datetime
from ..services.call_handler import CallHandler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

@router.post("/webhook")
async def synthflow_webhook(
    request: Request,
    payload: Dict[str, Any]
):
    """
    Handle incoming webhooks from Synthflow for real-time call processing.
    
    Flow:
    1. Synthflow sends caller's transcribed speech
    2. We process through GPT-4 with property context
    3. Return response for Synthflow to speak via TTS
    """
    try:
        # COMPREHENSIVE LOGGING - Log absolutely everything
        logger.info("\n" + "="*60)
        logger.info("SYNTHFLOW WEBHOOK RECEIVED")
        logger.info("="*60)
        logger.info(f"RAW PAYLOAD: {json.dumps(payload, indent=2)}")
        logger.info("="*60)
        
        # Check for different Synthflow payload structures
        # Synthflow might send data in different formats
        
        # Try to extract from root level first - SYNTHFLOW SENDS 'query'!
        caller_message = payload.get("query", "")  # This is what Synthflow sends!
        call_id = payload.get("call_id", "")
        caller_phone = payload.get("from_number", "")
        
        # If not found, try other common fields
        if not caller_message:
            caller_message = payload.get("message", "")
        
        if not caller_message:
            # Try 'input' field
            caller_message = payload.get("input", "")
        
        if not caller_message:
            # Try 'text' field
            caller_message = payload.get("text", "")
        
        if not caller_message:
            # Try 'transcript' field
            caller_message = payload.get("transcript", "")
        
        if not caller_message:
            # Try nested in 'data'
            data = payload.get("data", {})
            caller_message = data.get("message", "") or data.get("input", "") or data.get("text", "")
        
        if not caller_message:
            # Try nested in 'user'
            user = payload.get("user", {})
            caller_message = user.get("message", "") or user.get("input", "")
        
        if not caller_message:
            # Try nested in 'call'
            call = payload.get("call", {})
            caller_message = call.get("transcript", "") or call.get("message", "")
            if not call_id:
                call_id = call.get("id", "")
            if not caller_phone:
                caller_phone = call.get("from", "")
        
        # Log what we extracted
        logger.info("\nEXTRACTED DATA:")
        logger.info(f"  Message/Input: '{caller_message}'")
        logger.info(f"  Call ID: '{call_id}'")
        logger.info(f"  Phone: '{caller_phone}'")
        
        # Extract property reference from the message
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
                    logger.info(f"  Extracted Property: '{property_reference}'")
                    break
        
        logger.info("="*60)
        
        # Initialize call handler
        call_handler = CallHandler()
        
        # If we have a property reference, get the property info directly
        property_info = None
        if property_reference:
            logger.info(f"\nSearching for property: '{property_reference}'")
            property_info = await call_handler._get_property_info(property_reference)
            if property_info:
                logger.info(f"Found property: {property_info.get('address')}")
            else:
                logger.info(f"No property found for: '{property_reference}'")
        
        # Process the caller's message and generate response
        response = await call_handler.process_caller_message(
            call_id=call_id or "synthflow-" + str(datetime.now().timestamp()),
            caller_message=caller_message,
            caller_phone=caller_phone,
            property_reference=property_reference
        )
        
        # Save call to database for frontend to display
        try:
            # Use the basic columns that exist in the database
            call_data = {
                'call_id': call_id or "synthflow-" + str(datetime.now().timestamp()),
                'phone_number': caller_phone or 'Unknown',
                'transcript': caller_message or 'No transcript',
                'ai_response': response["message"],
                'property_mentioned': property_reference,
                'lead_score': 75 if property_reference else 50,
                'status': 'completed',
                'duration': 0  # Will be updated when call ends
            }
            
            result = call_handler.supabase.table('calls').insert(call_data).execute()
            logger.info(f"\nCall saved to database with ID: {call_data['call_id']}")
        except Exception as e:
            logger.error(f"\nError saving call to database: {str(e)}")
            logger.error(f"Call data attempted: {json.dumps(call_data, indent=2)}")
        
        # Build response for Synthflow
        # Synthflow expects specific format
        synthflow_response = {
            "success": True,
            "message": response["message"],  # Some Synthflow configs use 'message'
            "response": response["message"],  # Others use 'response'
            "text": response["message"],      # Some use 'text'
            "output": response["message"],    # Some use 'output'
            "actions": response.get("actions", []),
            "metadata": {
                "call_id": call_id,
                "property_reference": property_reference,
                "property_found": property_info is not None
            }
        }
        
        logger.info(f"\nRETURNING TO SYNTHFLOW: {json.dumps(synthflow_response, indent=2)}")
        logger.info("="*60 + "\n")
        
        return synthflow_response
        
    except Exception as e:
        logger.error(f"\nERROR processing Synthflow webhook: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Return a graceful error response that Synthflow can speak
        error_response = {
            "success": False,
            "message": "I'm having a bit of trouble right now. Could you please repeat that?",
            "response": "I'm having a bit of trouble right now. Could you please repeat that?",
            "text": "I'm having a bit of trouble right now. Could you please repeat that?",
            "output": "I'm having a bit of trouble right now. Could you please repeat that?",
            "error": str(e)
        }
        logger.info(f"\nRETURNING ERROR TO SYNTHFLOW: {json.dumps(error_response, indent=2)}")
        return error_response

@router.post("/call-ended")
async def call_ended_webhook(
    request: Request,
    payload: Dict[str, Any]
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