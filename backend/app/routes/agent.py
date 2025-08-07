from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json
import logging
from ..services.agent_assistant import AgentAssistant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])

class VoiceCommandRequest(BaseModel):
    command: str
    agent_id: str

@router.post("/voice-command")
async def process_voice_command(request: VoiceCommandRequest):
    """
    Process voice commands from agents in the app.
    
    Examples:
    - "Add a showing for 123 Main Street tomorrow at 3pm"
    - "Create a task to call John Smith"
    - "What properties do I have listed?"
    - "Mark Pine Lane as sold"
    """
    try:
        assistant = AgentAssistant()
        
        # Process the command through AI
        result = await assistant.process_command(
            command=request.command,
            agent_id=request.agent_id
        )
        
        return {
            "success": True,
            "response": result["response"],
            "action": result.get("action"),
            "data": result.get("data")
        }
        
    except Exception as e:
        logger.error(f"Error processing voice command: {str(e)}")
        return {
            "success": False,
            "response": "I'm sorry, I couldn't process that command. Please try again.",
            "error": str(e)
        }