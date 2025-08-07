from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from datetime import datetime
from supabase import create_client, Client
from ..deps.auth import get_current_agent
from ..services.agent_assistant import AgentAssistant

router = APIRouter(prefix="/api/agent", tags=["agent"])

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

class VoiceCommandRequest(BaseModel):
    command: str
    agent_id: str

class VoiceCommandResponse(BaseModel):
    success: bool
    response: str
    action: Optional[Dict[str, Any]] = None
    data: Optional[Dict[str, Any]] = None

@router.post("/voice-command", response_model=VoiceCommandResponse)
async def process_voice_command(request: VoiceCommandRequest):
    """Process voice commands from the agent and execute actions."""
    try:
        assistant = AgentAssistant()
        result = await assistant.process_command(request.command, request.agent_id)
        
        return VoiceCommandResponse(
            success=True,
            response=result["response"],
            action=result.get("action"),
            data=result.get("data")
        )
    except Exception as e:
        return VoiceCommandResponse(
            success=False,
            response=f"I couldn't process that command. Please try again.",
            action=None,
            data=None
        )

@router.get("/calls")
async def get_calls(
    limit: int = 50,
    offset: int = 0
):
    """Get recent calls from the database."""
    try:
        response = supabase.table('calls').select("*").order(
            'created_at', desc=True
        ).range(offset, offset + limit - 1).execute()
        
        return {
            "success": True,
            "calls": response.data,
            "total": len(response.data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/properties")
async def get_properties(
    status: Optional[str] = "active",
    limit: int = 50,
    offset: int = 0
):
    """Get properties from the database."""
    try:
        query = supabase.table('listings').select("*")
        
        if status:
            query = query.eq('status', status)
            
        response = query.order(
            'created_at', desc=True
        ).range(offset, offset + limit - 1).execute()
        
        return {
            "success": True,
            "properties": response.data,
            "total": len(response.data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard-stats")
async def get_dashboard_stats():
    """Get statistics for the dashboard."""
    try:
        # Get counts from database
        calls_response = supabase.table('calls').select("*", count='exact').execute()
        properties_response = supabase.table('listings').select("*", count='exact').eq('status', 'active').execute()
        
        # Calculate lead scores
        hot_leads = 0
        if calls_response.data:
            hot_leads = len([c for c in calls_response.data if c.get('lead_score', 0) >= 75])
        
        return {
            "success": True,
            "stats": {
                "total_calls": len(calls_response.data) if calls_response.data else 0,
                "active_properties": len(properties_response.data) if properties_response.data else 0,
                "hot_leads": hot_leads,
                "scheduled_showings": 0  # TODO: Implement when calendar integration is ready
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/test-data")
async def create_test_data():
    """Create test data for demo purposes."""
    try:
        # This endpoint already exists in your database from sample_data.sql
        return {"success": True, "message": "Test data already loaded in database"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))