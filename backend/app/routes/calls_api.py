"""
API endpoints for retrieving call data, transcripts, and leads
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
from ..services.supabase_service import SupabaseService
from ..services.call_analysis_service import CallAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calls", tags=["calls"])

@router.get("/test-db")
async def test_database_connection() -> Dict[str, Any]:
    """
    Test database connection and verify tables exist
    """
    try:
        supabase = SupabaseService()
        
        # Test each table
        tests = {}
        
        # Test calls table
        try:
            result = supabase.client.table("calls").select("count", count="exact", head=True).execute()
            tests["calls"] = {"exists": True, "count": result.count}
        except Exception as e:
            tests["calls"] = {"exists": False, "error": str(e)}
        
        # Test call_transcripts table
        try:
            result = supabase.client.table("call_transcripts").select("count", count="exact", head=True).execute()
            tests["call_transcripts"] = {"exists": True, "count": result.count}
        except Exception as e:
            tests["call_transcripts"] = {"exists": False, "error": str(e)}
        
        # Test property_inquiries table
        try:
            result = supabase.client.table("property_inquiries").select("count", count="exact", head=True).execute()
            tests["property_inquiries"] = {"exists": True, "count": result.count}
        except Exception as e:
            tests["property_inquiries"] = {"exists": False, "error": str(e)}
        
        # Test lead_capture table
        try:
            result = supabase.client.table("lead_capture").select("count", count="exact", head=True).execute()
            tests["lead_capture"] = {"exists": True, "count": result.count}
        except Exception as e:
            tests["lead_capture"] = {"exists": False, "error": str(e)}
        
        return {
            "success": True,
            "database_connected": True,
            "tables": tests
        }
    except Exception as e:
        return {
            "success": False,
            "database_connected": False,
            "error": str(e)
        }

@router.get("/recent")
async def get_recent_calls(
    limit: int = Query(10, ge=1, le=100, description="Number of calls to retrieve")
) -> Dict[str, Any]:
    """
    Get recent calls with basic information
    """
    try:
        supabase = SupabaseService()
        calls = await supabase.get_recent_calls(limit=limit)
        
        return {
            "success": True,
            "count": len(calls),
            "calls": calls
        }
    except Exception as e:
        logger.error(f"Error fetching recent calls: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch recent calls")


@router.get("/search")
async def search_calls(
    phone_number: Optional[str] = Query(None, description="Filter by phone number"),
    status: Optional[str] = Query(None, description="Filter by call status"),
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
) -> Dict[str, Any]:
    """
    Search calls with filters
    """
    try:
        supabase = SupabaseService()
        calls = await supabase.search_calls(
            phone_number=phone_number,
            status=status,
            start_date=start_date,
            end_date=end_date
        )
        
        return {
            "success": True,
            "count": len(calls),
            "calls": calls
        }
    except Exception as e:
        logger.error(f"Error searching calls: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search calls")


@router.get("/{call_id}")
async def get_call_details(call_id: str) -> Dict[str, Any]:
    """
    Get detailed call information including transcript and property inquiries
    """
    try:
        supabase = SupabaseService()
        call = await supabase.get_call_with_transcript(call_id)
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        # Format the response
        response = {
            "success": True,
            "call": {
                "id": call["id"],
                "phone_number": call.get("phone_number"),
                "call_sid": call.get("call_sid"),
                "direction": call.get("direction"),
                "status": call.get("call_status"),
                "duration": call.get("duration"),
                "start_time": call.get("start_time"),
                "end_time": call.get("end_time"),
                "caller_city": call.get("caller_city"),
                "caller_state": call.get("caller_state"),
                "created_at": call.get("created_at")
            },
            "transcript": {
                "full_text": call.get("transcript"),
                "entries": call.get("transcript_entries", [])
            },
            "property_inquiries": call.get("property_inquiries", []),
            "lead_info": call.get("lead_info")
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching call details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch call details")


@router.get("/{call_id}/analyze")
async def analyze_call(call_id: str) -> Dict[str, Any]:
    """
    Analyze a call transcript using GPT-4 to extract insights, contact info, and summary
    """
    try:
        supabase = SupabaseService()
        call = await supabase.get_call_with_transcript(call_id)
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        # Analyze the call using GPT-4
        analysis_service = CallAnalysisService()
        analysis = await analysis_service.analyze_call_transcript(
            transcript_entries=call.get("transcript_entries", []),
            call_info=call
        )
        
        # Save the analysis results to the database for persistence
        try:
            await supabase.save_call_analysis(call_id, analysis)
        except Exception as e:
            logger.warning(f"Could not save analysis to database: {str(e)}")
        
        return {
            "success": True,
            "call_id": call_id,
            "analysis": analysis
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing call: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to analyze call")


@router.get("/{call_id}/transcript")
async def get_call_transcript(call_id: str) -> Dict[str, Any]:
    """
    Get just the transcript for a specific call
    """
    try:
        supabase = SupabaseService()
        call = await supabase.get_call_with_transcript(call_id)
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        return {
            "success": True,
            "call_id": call_id,
            "transcript": call.get("transcript"),
            "entries": call.get("transcript_entries", [])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching transcript: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch transcript")


@router.get("/leads/all")
async def get_all_leads() -> Dict[str, Any]:
    """
    Get all captured leads
    """
    try:
        supabase = SupabaseService()
        
        # Get all leads from the database
        response = supabase.client.table("lead_capture").select("*").order("created_at", desc=True).execute()
        
        leads = response.data or []
        
        # Categorize leads by status
        categorized = {
            "new": [],
            "contacted": [],
            "qualified": [],
            "nurturing": [],
            "closed_won": [],
            "closed_lost": []
        }
        
        for lead in leads:
            status = lead.get("lead_status", "new")
            if status in categorized:
                categorized[status].append(lead)
        
        return {
            "success": True,
            "total_count": len(leads),
            "leads": leads,
            "by_status": categorized,
            "summary": {
                "new": len(categorized["new"]),
                "contacted": len(categorized["contacted"]),
                "qualified": len(categorized["qualified"]),
                "nurturing": len(categorized["nurturing"]),
                "closed_won": len(categorized["closed_won"]),
                "closed_lost": len(categorized["closed_lost"])
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching leads: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch leads")


@router.get("/leads/{phone_number}")
async def get_lead_by_phone(phone_number: str) -> Dict[str, Any]:
    """
    Get lead information by phone number
    """
    try:
        supabase = SupabaseService()
        
        # Get lead by phone number
        response = supabase.client.table("lead_capture").select("*").eq("phone_number", phone_number).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        lead = response.data[0]
        
        # Get all calls from this phone number
        calls_response = supabase.client.table("calls").select("*").eq("phone_number", phone_number).order("created_at", desc=True).execute()
        
        return {
            "success": True,
            "lead": lead,
            "call_history": calls_response.data or [],
            "total_calls": len(calls_response.data or [])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching lead: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch lead")


@router.put("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: str,
    status: str = Query(..., description="New lead status")
) -> Dict[str, Any]:
    """
    Update lead status
    """
    try:
        valid_statuses = ['new', 'contacted', 'qualified', 'nurturing', 'closed_won', 'closed_lost']
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        supabase = SupabaseService()
        
        # Update lead status
        response = supabase.client.table("lead_capture").update({
            "lead_status": status,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", lead_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        return {
            "success": True,
            "lead": response.data[0]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating lead status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update lead status")


@router.get("/properties/inquiries")
async def get_property_inquiries(
    property_address: Optional[str] = Query(None, description="Filter by property address"),
    days: int = Query(7, description="Number of days to look back")
) -> Dict[str, Any]:
    """
    Get property inquiries from recent calls
    """
    try:
        supabase = SupabaseService()
        
        # Calculate date range
        start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        # Build query
        query = supabase.client.table("property_inquiries").select("*, calls(phone_number, caller_city, caller_state, created_at)")
        
        if property_address:
            query = query.eq("property_address", property_address)
        
        query = query.gte("created_at", start_date)
        response = query.order("created_at", desc=True).execute()
        
        inquiries = response.data or []
        
        # Group by property
        by_property = {}
        for inquiry in inquiries:
            address = inquiry.get("property_address", "Unknown")
            if address not in by_property:
                by_property[address] = {
                    "address": address,
                    "inquiries": [],
                    "total_interest": 0,
                    "high_interest_count": 0
                }
            
            by_property[address]["inquiries"].append(inquiry)
            
            # Calculate interest metrics
            interest = inquiry.get("interest_level", "medium")
            if interest in ["high", "very_high"]:
                by_property[address]["high_interest_count"] += 1
        
        return {
            "success": True,
            "total_inquiries": len(inquiries),
            "period_days": days,
            "inquiries": inquiries,
            "by_property": list(by_property.values())
        }
        
    except Exception as e:
        logger.error(f"Error fetching property inquiries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch property inquiries")


@router.get("/stats/dashboard")
async def get_dashboard_stats() -> Dict[str, Any]:
    """
    Get dashboard statistics for calls and leads
    """
    try:
        supabase = SupabaseService()
        
        # Get today's date range
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        
        # Get this week's date range (Monday to now)
        today = datetime.utcnow()
        days_since_monday = today.weekday()
        week_start = (today - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        
        # Get this month's date range
        month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        
        # Fetch various statistics
        # Total calls
        total_calls = supabase.client.table("calls").select("id", count="exact").execute()
        
        # Today's calls
        today_calls = supabase.client.table("calls").select("id", count="exact").gte("created_at", today_start).execute()
        
        # This week's calls
        week_calls = supabase.client.table("calls").select("id", count="exact").gte("created_at", week_start).execute()
        
        # This month's calls
        month_calls = supabase.client.table("calls").select("id", count="exact").gte("created_at", month_start).execute()
        
        # Total leads
        total_leads = supabase.client.table("lead_capture").select("id", count="exact").execute()
        
        # New leads (this week)
        new_leads = supabase.client.table("lead_capture").select("id", count="exact").gte("created_at", week_start).execute()
        
        # Property inquiries (this week)
        property_inquiries = supabase.client.table("property_inquiries").select("id", count="exact").gte("created_at", week_start).execute()
        
        # Average call duration
        calls_with_duration = supabase.client.table("calls").select("duration").not_.is_("duration", "null").execute()
        avg_duration = 0
        if calls_with_duration.data:
            durations = [c["duration"] for c in calls_with_duration.data if c["duration"]]
            if durations:
                avg_duration = sum(durations) / len(durations)
        
        return {
            "success": True,
            "stats": {
                "calls": {
                    "total": total_calls.count or 0,
                    "today": today_calls.count or 0,
                    "this_week": week_calls.count or 0,
                    "this_month": month_calls.count or 0,
                    "avg_duration_seconds": round(avg_duration, 2)
                },
                "leads": {
                    "total": total_leads.count or 0,
                    "new_this_week": new_leads.count or 0
                },
                "property_inquiries": {
                    "this_week": property_inquiries.count or 0
                }
            },
            "period": {
                "today": today_start,
                "week_start": week_start,
                "month_start": month_start
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard statistics")


@router.delete("/{call_id}")
async def delete_call(call_id: str) -> Dict[str, Any]:
    """
    Delete a call and all associated data
    """
    try:
        supabase = SupabaseService()
        
        # Delete the call (cascading deletes will handle transcripts, etc.)
        response = supabase.client.table("calls").delete().eq("id", call_id).execute()
        
        # Check if delete was successful (no exception means success)
        return {
            "success": True,
            "message": f"Call {call_id} deleted successfully"
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting call: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete call")


from pydantic import BaseModel

class BulkDeleteRequest(BaseModel):
    call_ids: List[str]

@router.post("/bulk-delete")
async def bulk_delete_calls(
    request: BulkDeleteRequest
) -> Dict[str, Any]:
    """
    Delete multiple calls at once
    """
    try:
        call_ids = request.call_ids
        if not call_ids:
            raise HTTPException(status_code=400, detail="No call IDs provided")
        
        supabase = SupabaseService()
        
        # Delete all calls in the list
        response = supabase.client.table("calls").delete().in_("id", call_ids).execute()
        
        # If no exception was thrown, delete was successful
        return {
            "success": True,
            "deleted_count": len(call_ids),
            "message": f"Successfully deleted {len(call_ids)} calls"
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk deleting calls: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to bulk delete calls")


@router.put("/{call_id}/archive")
async def archive_call(call_id: str) -> Dict[str, Any]:
    """
    Archive a call (mark as archived without deleting)
    """
    try:
        supabase = SupabaseService()
        
        # Update call status to archived
        response = supabase.client.table("calls").update({
            "status": "archived",
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", call_id).execute()
        
        if response.data:
            return {
                "success": True,
                "message": f"Call {call_id} archived successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Call not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving call: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to archive call")