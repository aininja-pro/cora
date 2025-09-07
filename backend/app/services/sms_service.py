"""
SMS Service
Core SMS functionality using TextBelt with templates, idempotency, and compliance.
"""
import os
import re
import time
import asyncio
import requests
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional, Tuple
from datetime import datetime
import phonenumbers
import logging
from supabase import Client as SupabaseClient
from .supabase_service import supabase_service

from app.models.notifications import SMSRequest, SMSResponse, NotificationDB

logger = logging.getLogger(__name__)

class SMSService:
    """SMS service with TextBelt integration, templates, and compliance."""
    
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=3)
        self.textbelt_api_key = os.getenv("TEXTBELT_API_KEY")
        self.textbelt_url = "https://textbelt.com/text"
        self.supabase = supabase_service.client
        
        # Template definitions (MVP: code-based) - All include compliance "Reply STOP to opt out"
        self.templates = {
            "showing_confirm": "CORA here ✅ Your showing at {address} is set for {when}. Reply C to confirm, R to reschedule. Reply STOP to opt out.",
            "agent_summary": "Summary: {summary}. Actions: {actions_link}. Reply STOP to opt out.",
            "lead_captured": "New lead: {name}, {phone}, budget {budget}, area {city}. Open: {link}. Reply STOP to opt out.",
            "missed_call": "You missed a call. Reply CALL to ring back or VISIT to see the transcript: {url}. Reply STOP to opt out."
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
    
    async def check_tenant_sms_enabled(self, tenant_id: str) -> bool:
        """Check if SMS is enabled for tenant."""
        try:
            result = self.supabase.table("tenants").select("sms_enabled").eq("id", tenant_id).single().execute()
            
            if not result.data:
                return False
                
            tenant = result.data
            return tenant.get("sms_enabled", True)
        except Exception as e:
            logger.error(f"Failed to check tenant SMS config: {e}")
            return False
    
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
    
    async def send_textbelt_sms(
        self,
        to_number: str,
        message: str
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Send SMS via TextBelt with retry logic."""
        
        # FOR TESTING: Check if we're in development mode
        if os.getenv("APP_ENV") == "development":
            # Mock SMS sending for testing
            logger.info(f"📱 [MOCK] TextBelt SMS would be sent to {to_number[:8]}...")
            logger.info(f"📱 [MOCK] Message: {message}")
            mock_id = f"textbelt_mock_{int(time.time())}"
            return True, mock_id, None
        
        if not self.textbelt_api_key:
            return False, None, "TextBelt API key not configured"
        
        logger.info(f"Attempting TextBelt SMS to {to_number[:8]}... with {len(message)} char message")
        
        # Use requests with ThreadPoolExecutor - TextBelt's documented approach
        def _send_textbelt_sync():
            return requests.post(self.textbelt_url, {
                'phone': to_number,
                'message': message,
                'key': self.textbelt_api_key
            }, timeout=30)
        
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(self.executor, _send_textbelt_sync)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get('success'):
                    text_id = result.get('textId', f'textbelt_{int(time.time())}')
                    quota_remaining = result.get('quotaRemaining', 'unknown')
                    
                    logger.info(f"TextBelt SMS sent successfully: textId={text_id}, quota_remaining={quota_remaining}, to={to_number[:8]}...")
                    return True, text_id, None
                else:
                    error_msg = result.get('error', 'TextBelt API error')
                    logger.error(f"TextBelt API error: {error_msg}")
                    return False, None, f"TextBelt error: {error_msg}"
            else:
                error_msg = f"TextBelt HTTP error: {response.status_code}"
                return False, None, error_msg
                
        except Exception as e:
            error_msg = f"TextBelt connection error: {str(e)}"
            logger.error(f"TextBelt SMS failed: {error_msg}")
            return False, None, error_msg
        
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
            sms_enabled = await self.check_tenant_sms_enabled(request.tenant_id)
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
            
            # Send via TextBelt
            success, message_id, error = await self.send_textbelt_sms(
                to_number=normalized_phone,
                message=message
            )
            
            # Update record with result
            if success:
                await self.update_notification_status(notification_id, "sent", message_id)
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