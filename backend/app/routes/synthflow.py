from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any
import json
import logging
from datetime import datetime
from ..services.call_handler import CallHandler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

# Store last few webhook payloads for debugging
debug_payloads = []

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
        # Store payload for debugging (keep last 10)
        global debug_payloads
        debug_payloads.append({
            "timestamp": datetime.now().isoformat(),
            "type": "webhook",
            "payload": payload
        })
        if len(debug_payloads) > 10:
            debug_payloads.pop(0)
        
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
        
        # Try multiple fields for call_id
        call_id = payload.get("call_id", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("callId", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("id", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("session_id", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("sessionId", "")
        if not call_id or call_id == "<call_id>":
            # Generate a unique ID if none provided
            call_id = f"synthflow-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Try multiple fields for phone number
        caller_phone = payload.get("from_number", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("phone", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("phone_number", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("phoneNumber", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("from", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("caller", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("caller_phone", "")
        if not caller_phone or caller_phone == "Unknown":
            caller_phone = payload.get("callerPhone", "")
        
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
            if not call_id or call_id == "<call_id>":
                call_id = call.get("id", "") or call.get("call_id", "")
            if not caller_phone or caller_phone == "Unknown":
                caller_phone = call.get("from", "") or call.get("phone", "")
        
        # Try to get full transcript if available
        full_transcript = payload.get("transcript", "")
        if not full_transcript:
            full_transcript = payload.get("full_transcript", "")
        if not full_transcript:
            full_transcript = payload.get("conversation", "")
        if not full_transcript:
            full_transcript = payload.get("history", "")
        if not full_transcript and "call" in payload:
            full_transcript = payload["call"].get("transcript", "") or payload["call"].get("full_transcript", "")
        
        # Log what we extracted
        logger.info("\nEXTRACTED DATA:")
        logger.info(f"  Message/Input: '{caller_message}'")
        logger.info(f"  Call ID: '{call_id}'")
        logger.info(f"  Phone: '{caller_phone}'")
        logger.info(f"  Full Transcript: '{full_transcript[:200]}...' (length: {len(full_transcript)})")
        
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
                'call_id': call_id,
                'phone_number': caller_phone if caller_phone and caller_phone != "Unknown" else 'Unknown',
                'transcript': full_transcript if full_transcript else caller_message or 'No transcript',
                'ai_response': response["message"],
                'property_mentioned': property_reference,
                'lead_score': 75 if property_reference else 50,
                'status': 'in_progress',  # Mark as in_progress until call ends
                'duration': 0,  # Will be updated when call ends
                'metadata': {
                    'current_message': caller_message,
                    'has_full_transcript': bool(full_transcript)
                }
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
    """Handle call ended notifications from Synthflow with complete call data."""
    try:
        # Store payload for debugging
        global debug_payloads
        debug_payloads.append({
            "timestamp": datetime.now().isoformat(),
            "type": "call-ended",
            "payload": payload
        })
        if len(debug_payloads) > 10:
            debug_payloads.pop(0)
        
        logger.info("\n" + "="*60)
        logger.info("CALL ENDED WEBHOOK RECEIVED")
        logger.info("="*60)
        logger.info(f"RAW PAYLOAD: {json.dumps(payload, indent=2)}")
        logger.info("="*60)
        
        # Extract call information - try multiple field names
        call_id = payload.get("call_id", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("callId", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("id", "")
        if not call_id or call_id == "<call_id>":
            call_id = payload.get("session_id", "")
        
        # Extract call duration
        duration = payload.get("duration", 0)
        if not duration:
            duration = payload.get("call_duration", 0)
        if not duration:
            duration = payload.get("callDuration", 0)
        
        # Extract recording URL
        recording_url = payload.get("recording_url", "")
        if not recording_url:
            recording_url = payload.get("recordingUrl", "")
        if not recording_url:
            recording_url = payload.get("recording", "")
        
        # Extract phone number - this might be available at call end
        caller_phone = payload.get("from_number", "")
        if not caller_phone:
            caller_phone = payload.get("phone", "")
        if not caller_phone:
            caller_phone = payload.get("caller", "")
        if not caller_phone:
            caller_phone = payload.get("from", "")
        
        # Extract full transcript - often available at call end
        full_transcript = payload.get("transcript", "")
        if not full_transcript:
            full_transcript = payload.get("full_transcript", "")
        if not full_transcript:
            full_transcript = payload.get("conversation", "")
        if not full_transcript:
            full_transcript = payload.get("call_transcript", "")
        
        # Extract call summary if available
        call_summary = payload.get("summary", "")
        if not call_summary:
            call_summary = payload.get("call_summary", "")
        
        # Extract any extracted data (like email, name, etc.)
        extracted_data = payload.get("extracted_data", {})
        if not extracted_data:
            extracted_data = payload.get("data", {})
        if not extracted_data:
            extracted_data = payload.get("variables", {})
        
        logger.info("\nEXTRACTED CALL END DATA:")
        logger.info(f"  Call ID: '{call_id}'")
        logger.info(f"  Duration: {duration}s")
        logger.info(f"  Phone: '{caller_phone}'")
        logger.info(f"  Recording URL: '{recording_url}'")
        logger.info(f"  Full Transcript Length: {len(full_transcript)}")
        logger.info(f"  Summary: '{call_summary}'")
        logger.info(f"  Extracted Data: {json.dumps(extracted_data, indent=2)}")
        
        # Initialize call handler for database access
        call_handler = CallHandler()
        
        # Update existing call record or create new one
        try:
            if call_id and call_id != "<call_id>":
                # Try to update existing record
                update_data = {
                    'status': 'completed',
                    'duration': duration
                }
                
                # Add phone number if we got it
                if caller_phone and caller_phone != "Unknown":
                    update_data['phone_number'] = caller_phone
                
                # Add full transcript if available
                if full_transcript:
                    update_data['transcript'] = full_transcript
                
                # Add recording URL if available
                if recording_url:
                    if not update_data.get('metadata'):
                        update_data['metadata'] = {}
                    update_data['metadata']['recording_url'] = recording_url
                
                # Add summary if available
                if call_summary:
                    if not update_data.get('metadata'):
                        update_data['metadata'] = {}
                    update_data['metadata']['summary'] = call_summary
                
                # Add extracted data
                if extracted_data:
                    if not update_data.get('metadata'):
                        update_data['metadata'] = {}
                    update_data['metadata']['extracted'] = extracted_data
                
                # Update the call record
                result = call_handler.supabase.table('calls').update(update_data).eq('call_id', call_id).execute()
                
                if result.data:
                    logger.info(f"\nCall record updated successfully for ID: {call_id}")
                else:
                    # If no existing record, create new one
                    call_data = {
                        'call_id': call_id,
                        'phone_number': caller_phone or 'Unknown',
                        'transcript': full_transcript or 'No transcript available',
                        'status': 'completed',
                        'duration': duration,
                        'metadata': {
                            'recording_url': recording_url,
                            'summary': call_summary,
                            'extracted': extracted_data
                        }
                    }
                    result = call_handler.supabase.table('calls').insert(call_data).execute()
                    logger.info(f"\nNew call record created for ID: {call_id}")
            
            # TODO: Trigger post-call actions
            # - Send follow-up SMS/email if contact info available
            # - Update CRM with call details
            # - Schedule follow-up tasks for agent
            
        except Exception as e:
            logger.error(f"\nError updating call record: {str(e)}")
        
        return {
            "success": True, 
            "message": "Call end processed successfully",
            "call_id": call_id,
            "duration": duration
        }
        
    except Exception as e:
        logger.error(f"Error processing call ended webhook: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

@router.get("/debug/payloads")
async def get_debug_payloads():
    """Get the last few webhook payloads for debugging."""
    global debug_payloads
    return {
        "count": len(debug_payloads),
        "payloads": debug_payloads
    }

@router.post("/debug/test-webhook")
async def test_webhook(payload: Dict[str, Any]):
    """Test endpoint to see what data structure works."""
    logger.info(f"TEST WEBHOOK: {json.dumps(payload, indent=2)}")
    
    # Try to extract all possible fields
    extracted = {
        "call_id": payload.get("call_id", "not found"),
        "phone": payload.get("phone", "not found"),
        "from_number": payload.get("from_number", "not found"),
        "query": payload.get("query", "not found"),
        "message": payload.get("message", "not found"),
        "transcript": payload.get("transcript", "not found"),
    }
    
    # Check nested structures
    if "call" in payload:
        extracted["call_nested"] = {
            "id": payload["call"].get("id", "not found"),
            "phone": payload["call"].get("phone", "not found"),
            "transcript": payload["call"].get("transcript", "not found"),
        }
    
    if "data" in payload:
        extracted["data_nested"] = payload["data"]
    
    return {
        "success": True,
        "extracted": extracted,
        "raw": payload
    }