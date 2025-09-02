"""
SMS Notifications Models
Pydantic models for SMS notification requests, responses, and database records.
"""
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
import re


class SMSRequest(BaseModel):
    """Request model for sending SMS notifications."""
    tenant_id: str = Field(..., description="Tenant identifier")
    to: str = Field(..., description="Recipient phone number")
    template: str = Field(..., description="Template key (showing_confirm, agent_summary, lead_captured)")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Template variables")
    idempotency_key: Optional[str] = Field(None, description="Key to prevent duplicate sends")
    
    @validator('template')
    def validate_template(cls, v):
        allowed_templates = {'showing_confirm', 'agent_summary', 'lead_captured', 'missed_call'}
        if v not in allowed_templates:
            raise ValueError(f"Template must be one of: {allowed_templates}")
        return v
    
    @validator('to')
    def validate_phone_number(cls, v):
        # Basic E.164 validation (will be normalized in service)
        phone_pattern = r'^\+?[\d\s\-\(\)]{10,15}$'
        if not re.match(phone_pattern, v):
            raise ValueError("Invalid phone number format")
        return v


class SMSResponse(BaseModel):
    """Response model for SMS send requests."""
    ok: bool = Field(..., description="Success indicator")
    notification_id: Optional[str] = Field(None, description="Database notification ID")
    status: str = Field(..., description="Delivery status (sent, failed, queued)")
    error: Optional[str] = Field(None, description="Error message if failed")
    code: Optional[str] = Field(None, description="Error code (opted_out, sms_disabled, etc.)")


class NotificationDB(BaseModel):
    """Database model for notification records."""
    id: str
    tenant_id: str
    call_id: Optional[str]
    to_number: str
    template: str
    payload: Dict[str, Any]
    status: str  # queued, sent, failed
    error: Optional[str]
    provider_message_sid: Optional[str]
    idempotency_key: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class TestSMSRequest(BaseModel):
    """Request model for test SMS endpoint."""
    tenant_id: str = Field(..., description="Tenant identifier")
    to: str = Field(..., description="Test phone number")
    message: Optional[str] = Field("Test SMS from CORA", description="Test message content")