import os
import hmac
import hashlib
from fastapi import HTTPException, Header, Request
from typing import Optional

async def verify_synthflow_webhook(
    request: Request,
    x_synthflow_signature: Optional[str] = Header(None, alias="X-Synthflow-Signature")
) -> bool:
    """
    Verify that the webhook request is from Synthflow.
    
    Synthflow signs webhooks with HMAC SHA256 using a shared secret.
    """
    webhook_secret = os.getenv("SYNTHFLOW_WEBHOOK_SECRET")
    
    # If no secret configured, skip verification in development
    if not webhook_secret:
        if os.getenv("APP_ENV") == "development":
            return True
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    
    if not x_synthflow_signature:
        raise HTTPException(status_code=401, detail="Missing webhook signature")
    
    # Get the raw body
    body = await request.body()
    
    # Calculate expected signature
    expected_signature = hmac.new(
        webhook_secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()
    
    # Compare signatures
    if not hmac.compare_digest(expected_signature, x_synthflow_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    return True

async def get_current_agent(
    authorization: Optional[str] = Header(None)
) -> dict:
    """
    Get the current authenticated agent from JWT token.
    
    For now, returns a mock agent. Will integrate with Supabase Auth later.
    """
    # TODO: Implement JWT verification with Supabase
    return {
        "id": "default-agent-id",
        "email": "agent@example.com",
        "name": "Default Agent"
    }