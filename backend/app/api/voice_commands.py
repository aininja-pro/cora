from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import json
import os
from typing import Dict, Any, Optional
from datetime import datetime

router = APIRouter()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class VoiceCommandRequest(BaseModel):
    command: str

class TaskResponse(BaseModel):
    type: str  # 'urgent' or 'queue'
    task_type: str  # 'callback', 'call', 'showing', 'follow_up', 'reminder', etc.
    title: str
    description: str
    contact: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    time: Optional[str] = None
    priority: str  # 'urgent', 'high', 'normal', 'low'
    actions: list[str] = []

@router.post("/api/voice/process-command")
async def process_voice_command(request: VoiceCommandRequest) -> TaskResponse:
    """
    Process a voice command using OpenAI to understand intent and extract information
    """
    try:
        # Define the function schema for OpenAI
        functions = [
            {
                "name": "create_task",
                "description": "Create a task from a voice command",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_type": {
                            "type": "string",
                            "enum": ["callback", "call", "showing", "follow_up", "reminder", "email", "text", "meeting", "contract", "listing", "other"],
                            "description": "The type of task"
                        },
                        "title": {
                            "type": "string",
                            "description": "A short, clear title for the task (max 50 chars)"
                        },
                        "description": {
                            "type": "string",
                            "description": "Full description of what needs to be done"
                        },
                        "contact": {
                            "type": "string",
                            "description": "Name of person or company involved (if any)"
                        },
                        "phone": {
                            "type": "string",
                            "description": "Phone number if mentioned"
                        },
                        "location": {
                            "type": "string",
                            "description": "Address or location if mentioned (e.g., for showings)"
                        },
                        "time": {
                            "type": "string",
                            "description": "Time or deadline if mentioned (e.g., '2pm', 'tomorrow', 'by end of day')"
                        },
                        "is_urgent": {
                            "type": "boolean",
                            "description": "True if the task is urgent, time-sensitive, or explicitly marked as urgent"
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["urgent", "high", "normal", "low"],
                            "description": "Priority level based on urgency and importance"
                        }
                    },
                    "required": ["task_type", "title", "description", "is_urgent", "priority"]
                }
            }
        ]

        # Call OpenAI with function calling
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {
                    "role": "system",
                    "content": """You are a real estate assistant AI that helps agents manage their tasks.
                    Parse voice commands and extract task information.
                    Be smart about understanding context:
                    - "Call back" means return a phone call (callback)
                    - "Schedule a showing" means set up a property viewing
                    - "Remind me" means create a reminder
                    - If someone says "urgent" or "ASAP" or "right away", mark as urgent
                    - Extract names, phone numbers, addresses, and times when mentioned
                    - Create clear, actionable task titles"""
                },
                {
                    "role": "user",
                    "content": request.command
                }
            ],
            functions=functions,
            function_call={"name": "create_task"},
            temperature=0.3
        )

        # Extract the function call
        function_call = response.choices[0].message.function_call
        if not function_call:
            raise HTTPException(status_code=400, detail="Could not parse command")

        # Parse the arguments
        args = json.loads(function_call.arguments)

        # Determine appropriate actions based on task type
        actions_map = {
            "callback": ["Call Now", "Send SMS"],
            "call": ["Call Now", "Schedule Call"],
            "showing": ["Confirm Time", "Send Details"],
            "follow_up": ["Call", "Email"],
            "reminder": ["Mark Done", "Snooze"],
            "email": ["Send Email", "Draft"],
            "text": ["Send SMS", "Call"],
            "meeting": ["Add to Calendar", "Send Invite"],
            "contract": ["Review", "Send"],
            "listing": ["Send Listings", "Schedule Showing"],
            "other": ["Start", "Add Note"]
        }

        actions = actions_map.get(args["task_type"], ["Start", "Add Note"])

        # Build the response
        return TaskResponse(
            type="urgent" if args["is_urgent"] else "queue",
            task_type=args["task_type"],
            title=args["title"][:50],  # Ensure title isn't too long
            description=args["description"],
            contact=args.get("contact"),
            phone=args.get("phone"),
            location=args.get("location"),
            time=args.get("time"),
            priority=args["priority"],
            actions=actions
        )

    except Exception as e:
        print(f"Error processing voice command: {e}")
        # Fallback to a simple task if OpenAI fails
        return TaskResponse(
            type="queue",
            task_type="other",
            title=request.command[:50],
            description=request.command,
            priority="normal",
            actions=["Start", "Add Note"]
        )