"""
SMS Service
Core SMS functionality using Twilio with templates, idempotency, and compliance.
"""
import os
import re
import time
import asyncio
from typing import Dict, Optional, Tuple
from datetime import datetime
import phonenumbers
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
import logging
from supabase import create_client, Client as SupabaseClient

from app.models.notifications import SMSRequest, SMSResponse, NotificationDB

logger = logging.getLogger(__name__)

class SMSService:
    """SMS service with Twilio integration, templates, and compliance."""
    
    def __init__(self):
        self.twilio_client = Client(
            os.getenv("TWILIO_SID"),
            os.getenv("TWILIO_TOKEN")
        )
        self.supabase: SupabaseClient = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY")  # Use existing SUPABASE_KEY from environment
        )
        self.default_messaging_sid = os.getenv("TWILIO_MESSAGING_SERVICE_SID")  # Optional
        self.default_phone_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        # Template definitions (MVP: code-based)
        self.templates = {
            "showing_confirm": "CORA here ✅ Your showing at {address} is set for {when}. Reply C to confirm, R to reschedule.",
            "agent_summary": "Summary: {summary}. Actions: {actions_link}",
            "lead_captured": "New lead: {name}, {phone}, budget {budget}, area {city}. Open: {link}",
            "missed_call": "You missed a call. Reply CALL to ring back or VISIT to see the transcript: {url}"
        }
    
    def normalize_phone_number(self, phone: str) -> str:
        """Normalize phone number to E.164 format."""
        try:
            # Parse with US as default country
            parsed = phonenumbers.parse(phone, "US")
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError(f"Invalid phone number: {phone}")
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except Exception as e:
            raise ValueError(f"Phone normalization failed: {str(e)}")
    
    def render_template(self, template: str, payload: Dict) -> str:
        """Render SMS template with payload data."""
        if template not in self.templates:
            raise ValueError(f"Unknown template: {template}")
        
        template_str = self.templates[template]
        try:
            message = template_str.format(**payload)
            
            # Truncate to 320 chars (2 SMS segments) as per requirements
            if len(message) > 320:
                message = message[:317] + "..."
            
            return message
        except KeyError as e:
            raise ValueError(f"Missing template variable: {e}")
    
    async def check_tenant_sms_enabled(self, tenant_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """Check if SMS is enabled for tenant and get Twilio config."""
        try:
            result = self.supabase.table("tenants").select(
                "sms_enabled, twilio_messaging_service_sid, sms_default_from"
            ).eq("id", tenant_id).single().execute()
            
            if not result.data:
                return False, None, None
                
            tenant = result.data
            return (
                tenant.get("sms_enabled", True),
                tenant.get("twilio_messaging_service_sid"),
                tenant.get("sms_default_from")
            )
        except Exception as e:
            logger.error(f"Failed to check tenant SMS config: {e}")
            return False, None, None
    
    async def check_contact_opt_out(self, phone: str) -> bool:
        """Check if contact has opted out of SMS."""
        try:
            result = self.supabase.table("contacts").select("sms_opt_out").eq("phone", phone).single().execute()
            return result.data and result.data.get("sms_opt_out", False)
        except Exception:
            # Contact not found - assume not opted out
            return False
    
    async def check_idempotency(self, idempotency_key: str) -> Optional[NotificationDB]:
        """Check if notification already sent for idempotency key."""
        if not idempotency_key:
            return None
            
        try:
            result = self.supabase.table("notifications").select("*").eq(
                "idempotency_key", idempotency_key
            ).single().execute()
            
            if result.data:
                return NotificationDB(**result.data)
        except Exception:
            # Not found is OK
            pass
        return None
    
    async def create_notification_record(
        self,
        tenant_id: str,
        call_id: Optional[str],
        to_number: str,
        template: str,
        payload: Dict,
        idempotency_key: Optional[str] = None
    ) -> str:
        """Create notification record in database."""
        try:
            data = {
                "tenant_id": tenant_id,
                "call_id": call_id,
                "to_number": to_number,
                "template": template,
                "payload": payload,
                "status": "queued",
                "idempotency_key": idempotency_key
            }
            
            result = self.supabase.table("notifications").insert(data).execute()
            return result.data[0]["id"]
        except Exception as e:
            logger.error(f"Failed to create notification record: {e}")
            raise
    
    async def update_notification_status(
        self,
        notification_id: str,
        status: str,
        provider_message_sid: Optional[str] = None,
        error: Optional[str] = None
    ):
        """Update notification status in database."""
        try:
            update_data = {"status": status}
            
            if status == "sent":
                update_data["sent_at"] = datetime.utcnow().isoformat()
                
            if provider_message_sid:
                update_data["provider_message_sid"] = provider_message_sid
                
            if error:
                update_data["error"] = error[:500]  # Truncate long errors
            
            self.supabase.table("notifications").update(update_data).eq("id", notification_id).execute()
        except Exception as e:
            logger.error(f"Failed to update notification status: {e}")
    
    async def send_twilio_sms(
        self,
        to_number: str,
        message: str,
        messaging_service_sid: Optional[str] = None,
        from_number: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Send SMS via Twilio with retry logic."""
        
        # Determine sending method
        if messaging_service_sid:
            send_params = {"messaging_service_sid": messaging_service_sid}
        elif from_number:
            send_params = {"from_": from_number}
        else:
            send_params = {"messaging_service_sid": self.default_messaging_sid}
        
        # FOR TESTING: Check if we're in development mode
        if os.getenv("APP_ENV") == "development":
            # Mock SMS sending for testing
            logger.info(f"📱 [MOCK] SMS would be sent to {to_number[:8]}...")
            logger.info(f"📱 [MOCK] From: {send_params}")
            logger.info(f"📱 [MOCK] Message: {message}")
            mock_sid = f"SM_mock_{int(time.time())}"
            return True, mock_sid, None
        
        # Retry logic: 3 attempts with exponential backoff
        for attempt in range(3):
            try:
                start_time = time.time()
                
                twilio_message = self.twilio_client.messages.create(
                    body=message,
                    to=to_number,
                    **send_params
                )
                
                duration_ms = int((time.time() - start_time) * 1000)
                
                logger.info(f"SMS sent successfully: SID={twilio_message.sid}, duration={duration_ms}ms, to={to_number[:8]}...")
                
                return True, twilio_message.sid, None
                
            except TwilioRestException as e:
                error_msg = f"Twilio error: {e.code} - {e.msg}"
                logger.error(f"SMS send attempt {attempt + 1} failed: {error_msg}")
                
                # Don't retry on client errors (400s)
                if 400 <= e.status < 500:
                    return False, None, error_msg
                
                # Exponential backoff for server errors
                if attempt < 2:  # Don't sleep after last attempt
                    wait_time = 0.2 * (4 ** attempt)  # 200ms, 800ms, 2s
                    await asyncio.sleep(wait_time)
            
            except Exception as e:
                error_msg = f"Unexpected error: {str(e)}"
                logger.error(f"SMS send attempt {attempt + 1} failed: {error_msg}")
                
                if attempt < 2:
                    await asyncio.sleep(0.2 * (4 ** attempt))
        
        return False, None, "All retry attempts failed"
    
    async def send_sms(self, request: SMSRequest) -> SMSResponse:
        """Main SMS sending function with full validation and compliance."""
        start_time = time.time()
        
        try:
            # Normalize phone number
            normalized_phone = self.normalize_phone_number(request.to)
            
            # Check idempotency first
            if request.idempotency_key:
                existing = await self.check_idempotency(request.idempotency_key)
                if existing and existing.status == "sent":
                    logger.info(f"Idempotent request found: {existing.id}")
                    return SMSResponse(
                        ok=True,
                        notification_id=existing.id,
                        status=existing.status
                    )
            
            # Check tenant SMS enabled
            sms_enabled, messaging_sid, from_number = await self.check_tenant_sms_enabled(request.tenant_id)
            if not sms_enabled:
                return SMSResponse(
                    ok=False,
                    status="failed",
                    error="SMS disabled for tenant",
                    code="sms_disabled"
                )
            
            # Check contact opt-out
            opted_out = await self.check_contact_opt_out(normalized_phone)
            if opted_out:
                return SMSResponse(
                    ok=False,
                    status="failed",
                    error="Contact has opted out of SMS",
                    code="opted_out"
                )
            
            # Render message
            message = self.render_template(request.template, request.payload)
            
            # Create notification record
            notification_id = await self.create_notification_record(
                tenant_id=request.tenant_id,
                call_id=request.payload.get("call_id"),
                to_number=normalized_phone,
                template=request.template,
                payload=request.payload,
                idempotency_key=request.idempotency_key
            )
            
            # Send via Twilio
            success, message_sid, error = await self.send_twilio_sms(
                to_number=normalized_phone,
                message=message,
                messaging_service_sid=messaging_sid,
                from_number=from_number
            )
            
            # Update record with result
            if success:
                await self.update_notification_status(notification_id, "sent", message_sid)
                status = "sent"
            else:
                await self.update_notification_status(notification_id, "failed", error=error)
                status = "failed"
            
            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"SMS processing complete: {status}, duration={duration_ms}ms, template={request.template}")
            
            return SMSResponse(
                ok=success,
                notification_id=notification_id,
                status=status,
                error=error if not success else None
            )
            
        except Exception as e:
            error_msg = f"SMS service error: {str(e)}"
            logger.error(error_msg)
            return SMSResponse(
                ok=False,
                status="failed",
                error=error_msg
            )


# Singleton instance
sms_service = SMSService()