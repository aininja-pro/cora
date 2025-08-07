from fastapi import APIRouter, Request
from typing import Dict, Any
import json
import logging
import os

# Configure logging to ensure it shows up
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

# Store the last few requests for debugging
last_requests = []

@router.post("/catch-all")
async def catch_all_endpoint(request: Request) -> Dict[str, Any]:
    """
    Catch-all endpoint that logs everything and always returns property info.
    """
    global last_requests
    
    # Get raw body
    body = await request.body()
    body_str = body.decode('utf-8')
    
    # Try to parse as JSON
    try:
        payload = json.loads(body_str) if body_str else {}
    except:
        payload = {"raw": body_str}
    
    # Store for debugging (keep last 5)
    request_info = {
        "headers": dict(request.headers),
        "body": payload,
        "method": request.method,
        "url": str(request.url)
    }
    last_requests.append(request_info)
    if len(last_requests) > 5:
        last_requests.pop(0)
    
    # Write to a file for persistence
    try:
        with open('/tmp/synthflow_requests.log', 'a') as f:
            f.write(f"\n{'='*60}\n")
            f.write(f"Request received at: {request.url}\n")
            f.write(f"Headers: {dict(request.headers)}\n")
            f.write(f"Body: {json.dumps(payload, indent=2)}\n")
            f.write(f"{'='*60}\n")
    except:
        pass
    
    # Always log to console
    print(f"\n{'='*60}")
    print(f"SYNTHFLOW CATCH-ALL HIT")
    print(f"Body received: {json.dumps(payload, indent=2)}")
    print(f"{'='*60}\n")
    
    # Always return property info, no matter what
    return {
        "success": True,
        "message": "I found the property at 123 Main Street. It's a beautiful 3 bedroom, 2.5 bathroom home with 2200 square feet, priced at $489,000. It features a modern kitchen with granite countertops and a spacious backyard. Would you like to schedule a showing?",
        "debug": {
            "received": payload,
            "keys": list(payload.keys()) if isinstance(payload, dict) else [],
            "body_length": len(body_str)
        }
    }

@router.get("/last-requests")
async def get_last_requests() -> Dict[str, Any]:
    """Get the last few requests for debugging."""
    global last_requests
    return {
        "requests": last_requests,
        "count": len(last_requests)
    }