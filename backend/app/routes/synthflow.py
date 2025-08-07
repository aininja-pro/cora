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
        call_id = payload.get("call_id")
        caller_message = payload.get("message", "")
        caller_phone = payload.get("from_number")
        property_reference = payload.get("metadata", {}).get("property_reference")
        
        logger.info(f"Synthflow webhook - Call ID: {call_id}, Message: {caller_message}")
        
        # Initialize call handler
        call_handler = CallHandler()
        
        # Process the caller's message and generate response
        response = await call_handler.process_caller_message(
            call_id=call_id,
            caller_message=caller_message,
            caller_phone=caller_phone,
            property_reference=property_reference
        )
        
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