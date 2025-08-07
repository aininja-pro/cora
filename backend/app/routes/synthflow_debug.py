from fastapi import APIRouter, Request
from typing import Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

@router.post("/debug")
async def debug_endpoint(request: Request) -> Dict[str, Any]:
    """
    Debug endpoint to see exactly what Synthflow sends.
    This will log everything and return it back.
    """
    # Get raw body
    body = await request.body()
    body_str = body.decode('utf-8')
    
    # Try to parse as JSON
    try:
        payload = json.loads(body_str)
    except:
        payload = {"raw_body": body_str}
    
    # Log everything
    print("\n" + "="*60)
    print("SYNTHFLOW DEBUG ENDPOINT HIT")
    print("="*60)
    print(f"Headers: {dict(request.headers)}")
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    print(f"Raw Body: {body_str}")
    print(f"Parsed Payload: {json.dumps(payload, indent=2)}")
    print("="*60 + "\n")
    
    # Also use logger
    logger.info(f"SYNTHFLOW DEBUG - Headers: {dict(request.headers)}")
    logger.info(f"SYNTHFLOW DEBUG - Payload: {json.dumps(payload, indent=2)}")
    
    # Try to extract what might be the user's message from various possible fields
    possible_message = (
        payload.get("message") or
        payload.get("input") or
        payload.get("text") or
        payload.get("query") or
        payload.get("user_message") or
        payload.get("last_user_message") or
        payload.get("transcript") or
        (payload.get("data", {}).get("message") if isinstance(payload.get("data"), dict) else None) or
        "No message found"
    )
    
    # Return a response that shows what we received
    response = {
        "success": True,
        "message": f"I received your message: '{possible_message}'. The property at 123 Main Street is a 3 bedroom home priced at $489,000.",
        "debug_info": {
            "received_payload": payload,
            "extracted_message": possible_message,
            "all_keys": list(payload.keys()) if isinstance(payload, dict) else []
        }
    }
    
    print(f"Returning: {json.dumps(response, indent=2)}")
    return response