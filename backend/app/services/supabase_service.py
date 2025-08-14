"""
Supabase service for managing database operations
"""
import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from supabase import create_client, Client
import json

logger = logging.getLogger(__name__)

class SupabaseService:
    """Service for interacting with Supabase database"""
    
    def __init__(self):
        """Initialize Supabase client"""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        logger.info(f"Initializing Supabase client - URL: {supabase_url[:30]}..." if supabase_url else "No URL")
        
        if not supabase_url or not supabase_key:
            logger.error("SUPABASE_URL and SUPABASE_KEY environment variables not set!")
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
        
        self.client: Client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully")
    
    async def create_call(
        self,
        phone_number: str,
        call_sid: Optional[str] = None,
        direction: str = "inbound",
        caller_city: Optional[str] = None,
        caller_state: Optional[str] = None,
        agent_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new call record"""
        try:
            call_data = {
                "phone_number": phone_number,
                "call_sid": call_sid,
                "direction": direction,
                "caller_city": caller_city,
                "caller_state": caller_state,
                "call_status": "in_progress",
                "start_time": datetime.utcnow().isoformat(),
                "metadata": {}
            }
            
            if agent_id:
                call_data["agent_id"] = agent_id
            
            response = self.client.table("calls").insert(call_data).execute()
            
            if response.data:
                logger.info(f"Created call record: {response.data[0]['id']}")
                return response.data[0]
            else:
                raise Exception("Failed to create call record")
                
        except Exception as e:
            logger.error(f"Error creating call: {str(e)}")
            raise
    
    async def update_call(
        self,
        call_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update a call record"""
        try:
            response = self.client.table("calls").update(updates).eq("id", call_id).execute()
            
            if response.data:
                logger.info(f"Updated call: {call_id}")
                return response.data[0]
            else:
                raise Exception(f"Failed to update call {call_id}")
                
        except Exception as e:
            logger.error(f"Error updating call: {str(e)}")
            raise
    
    async def end_call(
        self,
        call_id: str,
        duration: Optional[int] = None,
        transcript: Optional[str] = None
    ) -> Dict[str, Any]:
        """Mark a call as completed"""
        try:
            updates = {
                "call_status": "completed",
                "end_time": datetime.utcnow().isoformat()
            }
            
            if duration:
                updates["duration"] = duration
            
            if transcript:
                updates["transcript"] = transcript
            
            return await self.update_call(call_id, updates)
            
        except Exception as e:
            logger.error(f"Error ending call: {str(e)}")
            raise
    
    async def add_transcript_entry(
        self,
        call_id: str,
        speaker: str,
        message: str,
        sequence_number: int,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Add a transcript entry for a call"""
        try:
            transcript_data = {
                "call_id": call_id,
                "speaker": speaker,
                "message": message,
                "sequence_number": sequence_number,
                "timestamp": datetime.utcnow().isoformat(),
                "metadata": metadata or {}
            }
            
            response = self.client.table("call_transcripts").insert(transcript_data).execute()
            
            if response.data:
                logger.debug(f"Added transcript entry for call {call_id}")
                return response.data[0]
            else:
                raise Exception("Failed to add transcript entry")
                
        except Exception as e:
            logger.error(f"Error adding transcript entry: {str(e)}")
            raise
    
    async def track_property_inquiry(
        self,
        call_id: str,
        property_address: Optional[str] = None,
        property_type: Optional[str] = None,
        price: Optional[float] = None,
        bedrooms: Optional[int] = None,
        bathrooms: Optional[float] = None,
        features: Optional[List[str]] = None,
        interest_level: Optional[str] = None
    ) -> Dict[str, Any]:
        """Track a property inquiry during a call"""
        try:
            inquiry_data = {
                "call_id": call_id,
                "property_address": property_address,
                "property_type": property_type,
                "price_mentioned": price,
                "bedrooms": bedrooms,
                "bathrooms": bathrooms,
                "features_discussed": features or [],
                "interest_level": interest_level or "medium",
                "scheduled_showing": False
            }
            
            # Remove None values
            inquiry_data = {k: v for k, v in inquiry_data.items() if v is not None}
            
            response = self.client.table("property_inquiries").insert(inquiry_data).execute()
            
            if response.data:
                logger.info(f"Tracked property inquiry for call {call_id}")
                return response.data[0]
            else:
                raise Exception("Failed to track property inquiry")
                
        except Exception as e:
            logger.error(f"Error tracking property inquiry: {str(e)}")
            raise
    
    async def capture_lead(
        self,
        call_id: str,
        phone_number: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        budget_min: Optional[float] = None,
        budget_max: Optional[float] = None,
        desired_bedrooms: Optional[int] = None,
        desired_location: Optional[str] = None,
        timeline: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Capture lead information from a call"""
        try:
            lead_data = {
                "call_id": call_id,
                "phone_number": phone_number,
                "name": name,
                "email": email,
                "budget_range_min": budget_min,
                "budget_range_max": budget_max,
                "desired_bedrooms": desired_bedrooms,
                "desired_location": desired_location,
                "timeline": timeline,
                "lead_status": "new",
                "lead_score": 50,  # Default score, can be calculated based on interaction
                "notes": notes
            }
            
            # Remove None values
            lead_data = {k: v for k, v in lead_data.items() if v is not None}
            
            # Check if lead already exists
            existing = self.client.table("lead_capture").select("*").eq("phone_number", phone_number).execute()
            
            if existing.data:
                # Update existing lead
                response = self.client.table("lead_capture").update(lead_data).eq("phone_number", phone_number).execute()
                logger.info(f"Updated existing lead: {phone_number}")
            else:
                # Create new lead
                response = self.client.table("lead_capture").insert(lead_data).execute()
                logger.info(f"Created new lead: {phone_number}")
            
            if response.data:
                return response.data[0]
            else:
                raise Exception("Failed to capture lead")
                
        except Exception as e:
            logger.error(f"Error capturing lead: {str(e)}")
            raise
    
    async def get_call_with_transcript(self, call_id: str) -> Dict[str, Any]:
        """Get a call with its full transcript"""
        try:
            # Get call details
            call_response = self.client.table("calls").select("*").eq("id", call_id).execute()
            
            if not call_response.data:
                raise Exception(f"Call {call_id} not found")
            
            call = call_response.data[0]
            
            # Get transcript entries
            transcript_response = (
                self.client.table("call_transcripts")
                .select("*")
                .eq("call_id", call_id)
                .order("sequence_number")
                .execute()
            )
            
            call["transcript_entries"] = transcript_response.data or []
            
            # Get property inquiries
            inquiry_response = (
                self.client.table("property_inquiries")
                .select("*")
                .eq("call_id", call_id)
                .execute()
            )
            
            call["property_inquiries"] = inquiry_response.data or []
            
            # Get lead info if exists
            if call.get("phone_number"):
                lead_response = (
                    self.client.table("lead_capture")
                    .select("*")
                    .eq("phone_number", call["phone_number"])
                    .execute()
                )
                
                if lead_response.data:
                    call["lead_info"] = lead_response.data[0]
            
            return call
            
        except Exception as e:
            logger.error(f"Error getting call with transcript: {str(e)}")
            raise
    
    async def get_recent_calls(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent calls"""
        try:
            response = (
                self.client.table("calls")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting recent calls: {str(e)}")
            raise
    
    async def search_calls(
        self,
        phone_number: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search calls with filters"""
        try:
            query = self.client.table("calls").select("*")
            
            if phone_number:
                query = query.eq("phone_number", phone_number)
            
            if status:
                query = query.eq("call_status", status)
            
            if start_date:
                query = query.gte("created_at", start_date)
            
            if end_date:
                query = query.lte("created_at", end_date)
            
            response = query.order("created_at", desc=True).execute()
            
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error searching calls: {str(e)}")
            raise