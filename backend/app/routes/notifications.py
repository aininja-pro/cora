"""
SMS Notifications API Routes
FastAPI endpoints for sending SMS notifications and testing.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict, Any
import logging
import time
import os

from app.models.notifications import SMSRequest, SMSResponse, TestSMSRequest
from app.services.sms_service import sms_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["notifications"])
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Simple JWT validation placeholder - integrate with your existing auth."""
    # TODO: Integrate with existing JWT validation from your auth system
    # For MVP, we trust the JWT since voice server already gets valid tokens
    return {"token": credentials.credentials}


@router.post("/sms", response_model=SMSResponse)
async def send_sms(
    request: SMSRequest
    # Skip auth for testing: current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Send SMS notification using template and payload.
    
    Validates tenant settings, contact opt-out status, and handles idempotency.
    Returns notification ID and delivery status.
    """
    try:
        logger.info(f"SMS request: tenant={request.tenant_id}, template={request.template}, to={request.to[:8]}...")
        
        response = await sms_service.send_sms(request)
        
        # Log the response (truncate PII)
        log_payload = {k: str(v)[:80] + "..." if len(str(v)) > 80 else v for k, v in request.payload.items()}
        logger.info(f"SMS response: ok={response.ok}, status={response.status}, payload={log_payload}")
        
        # Return HTTP error for client errors
        if not response.ok:
            if response.code == "opted_out":
                raise HTTPException(status_code=400, detail={"code": "opted_out", "message": response.error})
            elif response.code == "sms_disabled":
                raise HTTPException(status_code=400, detail={"code": "sms_disabled", "message": response.error})
            else:
                # Server error for Twilio failures
                raise HTTPException(status_code=500, detail={"message": response.error})
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SMS API error: {e}")
        raise HTTPException(status_code=500, detail={"message": "Internal server error"})


@router.post("/test", response_model=SMSResponse)
async def send_test_sms(
    request: TestSMSRequest
    # Skip auth for testing: current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Send test SMS to verify TextBelt configuration for a tenant.
    
    Development/debugging endpoint to validate SMS setup.
    """
    try:
        logger.info(f"Test SMS request: tenant={request.tenant_id}, to={request.to[:8]}...")
        
        # Convert test request to standard SMS request
        sms_request = SMSRequest(
            tenant_id=request.tenant_id,
            to=request.to,
            template="missed_call",  # Use a simple template
            payload={
                "url": "https://app.cora.ai/test"
            },
            idempotency_key=f"test_{request.tenant_id}_{int(time.time())}"
        )
        
        # Override message for test
        original_template = sms_service.templates["missed_call"]
        sms_service.templates["missed_call"] = request.message
        
        try:
            response = await sms_service.send_sms(sms_request)
        finally:
            # Restore original template
            sms_service.templates["missed_call"] = original_template
        
        if not response.ok:
            if response.code in ["opted_out", "sms_disabled"]:
                raise HTTPException(status_code=400, detail={"code": response.code, "message": response.error})
            else:
                raise HTTPException(status_code=500, detail={"message": response.error})
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Test SMS API error: {e}")
        raise HTTPException(status_code=500, detail={"message": "Internal server error"})


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check endpoint for SMS notification service."""
    return {
        "service": "sms_notifications",
        "status": "healthy",
        "provider": "textbelt",
        "textbelt_configured": bool(sms_service.textbelt_api_key),
        "supabase_configured": bool(os.getenv("SUPABASE_URL"))
    }