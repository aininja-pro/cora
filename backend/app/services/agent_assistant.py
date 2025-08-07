import os
import json
import logging
from typing import Dict, Any
from openai import AsyncOpenAI
from supabase import create_client, Client
from datetime import datetime, timedelta
import re

logger = logging.getLogger(__name__)

class AgentAssistant:
    """Handles voice commands from agents to manage their tasks and properties."""
    
    def __init__(self):
        self.openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.supabase: Client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY")
        )
    
    async def process_command(self, command: str, agent_id: str) -> Dict[str, Any]:
        """
        Process agent voice commands using GPT-4 with function calling.
        """
        try:
            # Define available functions for agents
            functions = [
                {
                    "name": "add_showing",
                    "description": "Schedule a property showing",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "property_address": {"type": "string"},
                            "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                            "time": {"type": "string", "description": "Time in HH:MM format"},
                            "client_name": {"type": "string"}
                        },
                        "required": ["property_address", "date", "time"]
                    }
                },
                {
                    "name": "create_task",
                    "description": "Create a new task or reminder",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "task_description": {"type": "string"},
                            "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                            "due_date": {"type": "string", "description": "Optional due date"}
                        },
                        "required": ["task_description"]
                    }
                },
                {
                    "name": "update_property_status",
                    "description": "Update the status of a property listing",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "property_address": {"type": "string"},
                            "new_status": {"type": "string", "enum": ["active", "pending", "sold", "inactive"]}
                        },
                        "required": ["property_address", "new_status"]
                    }
                },
                {
                    "name": "get_schedule",
                    "description": "Get the agent's schedule for a specific day",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "description": "Date in YYYY-MM-DD format or 'today'/'tomorrow'"}
                        },
                        "required": ["date"]
                    }
                },
                {
                    "name": "search_properties",
                    "description": "Search for properties based on criteria",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "criteria": {"type": "string", "description": "Search criteria like price, bedrooms, etc."}
                        },
                        "required": ["criteria"]
                    }
                }
            ]
            
            # Call GPT-4 with function calling
            response = await self.openai.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {
                        "role": "system",
                        "content": """You are Cora, an AI assistant for real estate agents. 
                        Help agents manage their properties, schedule showings, and create tasks.
                        Be concise and professional. Parse natural language commands into structured actions."""
                    },
                    {
                        "role": "user",
                        "content": command
                    }
                ],
                functions=functions,
                function_call="auto"
            )
            
            message = response.choices[0].message
            
            # If GPT-4 wants to call a function
            if message.function_call:
                function_name = message.function_call.name
                function_args = json.loads(message.function_call.arguments)
                
                # Execute the function
                result = await self._execute_function(
                    function_name, 
                    function_args, 
                    agent_id
                )
                
                return {
                    "response": result["message"],
                    "action": {
                        "type": function_name,
                        "data": function_args
                    },
                    "data": result.get("data")
                }
            else:
                # Just a conversational response
                return {
                    "response": message.content,
                    "action": None
                }
                
        except Exception as e:
            logger.error(f"Error processing agent command: {str(e)}")
            raise
    
    async def _execute_function(self, function_name: str, args: Dict, agent_id: str) -> Dict:
        """Execute the requested function."""
        
        if function_name == "add_showing":
            # Add to database
            showing_data = {
                "agent_id": agent_id,
                "property_address": args["property_address"],
                "date": args["date"],
                "time": args["time"],
                "client_name": args.get("client_name", "TBD"),
                "status": "scheduled"
            }
            
            # In production, save to database
            # self.supabase.table('showings').insert(showing_data).execute()
            
            return {
                "message": f"I've scheduled a showing for {args['property_address']} on {args['date']} at {args['time']}.",
                "data": showing_data
            }
        
        elif function_name == "create_task":
            # Create task in database
            task_data = {
                "agent_id": agent_id,
                "transcript": args["task_description"],
                "task_type": "reminder",
                "status": "pending",
                "metadata": {
                    "priority": args.get("priority", "medium"),
                    "due_date": args.get("due_date")
                }
            }
            
            self.supabase.table('tasks').insert(task_data).execute()
            
            return {
                "message": f"I've created a task: {args['task_description']}",
                "data": task_data
            }
        
        elif function_name == "update_property_status":
            # Find and update property
            response = self.supabase.table('listings').update({
                "status": args["new_status"]
            }).ilike('address', f'%{args["property_address"]}%').execute()
            
            return {
                "message": f"I've updated {args['property_address']} to {args['new_status']} status.",
                "data": {"updated": True}
            }
        
        elif function_name == "get_schedule":
            # Parse date
            date = args["date"]
            if date == "today":
                date = datetime.now().strftime("%Y-%m-%d")
                date_display = "today"
            elif date == "tomorrow":
                date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
                date_display = "tomorrow"
            else:
                date_display = date
            
            # Demo schedule data
            demo_schedule = {
                "today": [
                    "10:00 AM - Showing at 123 Main Street with John Smith",
                    "2:00 PM - Showing at 456 Oak Avenue with Sarah Johnson",
                    "4:30 PM - Follow-up call with Pine Lane buyer"
                ],
                "tomorrow": [
                    "9:00 AM - Property inspection at 789 Pine Lane",
                    "11:30 AM - Client meeting at office",
                    "3:00 PM - Showing at 123 Main Street with new client"
                ]
            }
            
            schedule = demo_schedule.get(date_display, ["No appointments scheduled"])
            schedule_text = ", ".join(schedule) if len(schedule) <= 2 else f"{len(schedule)} appointments: " + ", ".join(schedule[:2]) + ", and more"
            
            return {
                "message": f"Your schedule for {date_display}: {schedule_text}",
                "data": {"date": date, "appointments": schedule}
            }
        
        elif function_name == "search_properties":
            # Search properties based on criteria
            # In production, parse criteria and search database
            
            return {
                "message": f"I found 3 properties matching '{args['criteria']}'. The best match is 123 Main Street at $489,000.",
                "data": {"count": 3}
            }
        
        return {
            "message": "Command processed successfully.",
            "data": {}
        }