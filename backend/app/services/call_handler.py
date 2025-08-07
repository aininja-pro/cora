import os
import json
import logging
from typing import Dict, Any, Optional, List
from openai import AsyncOpenAI
from supabase import create_client, Client
from datetime import datetime

logger = logging.getLogger(__name__)

class CallHandler:
    """Handles real-time call processing with GPT-4 and property context."""
    
    def __init__(self):
        self.openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.supabase: Client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY")
        )
        
    async def process_caller_message(
        self,
        call_id: str,
        caller_message: str,
        caller_phone: Optional[str] = None,
        property_reference: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process caller's message through GPT-4 with property context.
        
        Returns:
            Dict containing the response message and any actions to take
        """
        try:
            # Load property information if reference provided
            property_context = ""
            if property_reference:
                property_data = await self._get_property_info(property_reference)
                if property_data:
                    property_context = self._format_property_context(property_data)
            
            # Get conversation history
            conversation_history = await self._get_conversation_history(call_id)
            
            # Prepare GPT-4 messages
            messages = [
                {
                    "role": "system",
                    "content": self._get_system_prompt(property_context)
                }
            ]
            
            # Add conversation history
            messages.extend(conversation_history)
            
            # Add current caller message
            messages.append({
                "role": "user",
                "content": caller_message
            })
            
            # Call GPT-4 with function calling
            response = await self.openai.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                functions=self._get_available_functions(),
                function_call="auto",
                temperature=0.7,
                max_tokens=150  # Keep responses concise for phone calls
            )
            
            # Extract response and any function calls
            assistant_message = response.choices[0].message
            response_text = assistant_message.content
            actions = []
            
            # Handle function calls if any
            if assistant_message.function_call:
                function_name = assistant_message.function_call.name
                function_args = json.loads(assistant_message.function_call.arguments)
                
                # Process the function call
                function_result = await self._execute_function(
                    function_name, 
                    function_args, 
                    caller_phone
                )
                
                actions.append({
                    "type": function_name,
                    "args": function_args,
                    "result": function_result
                })
                
                # Get a follow-up response after function execution
                if function_result.get("success"):
                    follow_up_prompt = f"The {function_name} was successful. Provide a brief confirmation."
                    follow_up_response = await self._get_quick_response(follow_up_prompt)
                    response_text += f" {follow_up_response}"
            
            # Save conversation turn
            await self._save_conversation_turn(
                call_id, 
                caller_message, 
                response_text,
                caller_phone
            )
            
            return {
                "message": response_text,
                "actions": actions,
                "call_id": call_id
            }
            
        except Exception as e:
            logger.error(f"Error in process_caller_message: {str(e)}")
            raise
    
    def _get_system_prompt(self, property_context: str) -> str:
        """Get the system prompt for GPT-4."""
        base_prompt = """You are Cora, a warm and professional AI assistant for a real estate agent. 
You're handling phone calls about property inquiries. Keep responses natural, conversational, and concise 
(under 2-3 sentences since this is a phone call). Be helpful and engaging.

Your personality:
- Warm and approachable
- Professional but not stiff
- Knowledgeable about real estate
- Proactive in offering help (showings, information, etc.)

Important guidelines:
- Keep responses brief for natural phone conversation
- Ask clarifying questions when needed
- Offer to schedule showings when appropriate
- Collect contact information when relevant"""

        if property_context:
            return f"{base_prompt}\n\nProperty Details:\n{property_context}"
        return base_prompt
    
    def _format_property_context(self, property_data: Dict) -> str:
        """Format property data into context string."""
        return f"""
Address: {property_data.get('address')}
Price: ${property_data.get('price', 0):,}
Beds: {property_data.get('beds')} | Baths: {property_data.get('baths')}
Square Feet: {property_data.get('sqft', 'N/A'):,}
Type: {property_data.get('type', 'House')}
Description: {property_data.get('description', 'Beautiful property with great features.')}
Status: {property_data.get('status', 'active').title()}
"""
    
    def _get_available_functions(self) -> List[Dict]:
        """Define functions available to GPT-4."""
        return [
            {
                "name": "schedule_showing",
                "description": "Schedule a property showing for the caller",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Proposed showing date (YYYY-MM-DD)"
                        },
                        "time": {
                            "type": "string", 
                            "description": "Proposed showing time (HH:MM)"
                        },
                        "name": {
                            "type": "string",
                            "description": "Caller's name"
                        },
                        "email": {
                            "type": "string",
                            "description": "Caller's email (if provided)"
                        }
                    },
                    "required": ["date", "time", "name"]
                }
            },
            {
                "name": "send_property_info",
                "description": "Send property information via SMS or email",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "method": {
                            "type": "string",
                            "enum": ["sms", "email"],
                            "description": "How to send the information"
                        },
                        "recipient": {
                            "type": "string",
                            "description": "Phone number or email address"
                        }
                    },
                    "required": ["method", "recipient"]
                }
            }
        ]
    
    async def _get_property_info(self, property_reference: str) -> Optional[Dict]:
        """Fetch property information from database."""
        try:
            # Search by address using ilike (case-insensitive partial match)
            response = self.supabase.table('listings').select("*").ilike(
                'address', f'%{property_reference}%'
            ).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching property info: {str(e)}")
            return None
    
    async def _get_conversation_history(self, call_id: str) -> List[Dict]:
        """Get conversation history for current call."""
        # TODO: Implement conversation history retrieval from database
        return []
    
    async def _save_conversation_turn(
        self, 
        call_id: str, 
        user_message: str, 
        assistant_message: str,
        caller_phone: Optional[str] = None
    ):
        """Save conversation turn to database."""
        try:
            # Save to voice_transcriptions table
            self.supabase.table('voice_transcriptions').insert({
                "transcript": f"Caller: {user_message}\nCora: {assistant_message}",
                "metadata": {
                    "call_id": call_id,
                    "caller_phone": caller_phone,
                    "timestamp": datetime.utcnow().isoformat()
                }
            }).execute()
        except Exception as e:
            logger.error(f"Error saving conversation: {str(e)}")
    
    async def _execute_function(
        self, 
        function_name: str, 
        args: Dict, 
        caller_phone: Optional[str]
    ) -> Dict:
        """Execute the function called by GPT-4."""
        try:
            if function_name == "schedule_showing":
                # TODO: Integrate with calendar API
                return {
                    "success": True,
                    "message": f"Showing scheduled for {args['date']} at {args['time']}"
                }
            
            elif function_name == "send_property_info":
                # TODO: Integrate with Twilio/Resend
                return {
                    "success": True,
                    "message": f"Property information sent via {args['method']}"
                }
            
            return {"success": False, "message": "Unknown function"}
            
        except Exception as e:
            logger.error(f"Error executing function {function_name}: {str(e)}")
            return {"success": False, "message": "Unable to complete that action"}
    
    async def _get_quick_response(self, prompt: str) -> str:
        """Get a quick response from GPT-4."""
        try:
            response = await self.openai.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are Cora. Provide a brief, natural response."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=50,
                temperature=0.7
            )
            return response.choices[0].message.content
        except:
            return "Got it!"