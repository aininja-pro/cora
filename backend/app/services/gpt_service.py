"""
GPT-4 service for intelligent property responses
"""
import os
import logging
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
import json

logger = logging.getLogger(__name__)

class GPTService:
    """Service for GPT-4 powered intelligent responses"""
    
    def __init__(self):
        """Initialize OpenAI client"""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY must be set")
        
        self.client = AsyncOpenAI(api_key=api_key)
        logger.info("GPT-4 service initialized")
    
    async def generate_property_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]] = None,
        caller_info: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Generate intelligent property response using GPT-4
        Returns both the response text and extracted information
        """
        try:
            # Build conversation context
            messages = self._build_conversation_context(
                user_message, 
                conversation_history, 
                caller_info
            )
            
            # Call GPT-4o-mini for faster responses
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",  # Faster and cheaper than gpt-4
                messages=messages,
                temperature=0.7,
                max_tokens=200,  # Shorter responses for phone calls
                functions=[
                    {
                        "name": "extract_lead_info",
                        "description": "Extract lead information from the conversation",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "property_interest": {
                                    "type": "string",
                                    "description": "Property address mentioned"
                                },
                                "budget_mentioned": {
                                    "type": "number",
                                    "description": "Budget amount mentioned"
                                },
                                "bedrooms_wanted": {
                                    "type": "integer",
                                    "description": "Number of bedrooms mentioned"
                                },
                                "scheduling_request": {
                                    "type": "object",
                                    "properties": {
                                        "requested": {"type": "boolean"},
                                        "date": {"type": "string"},
                                        "time": {"type": "string"}
                                    }
                                },
                                "interest_level": {
                                    "type": "string",
                                    "enum": ["low", "medium", "high", "very_high"]
                                },
                                "next_action": {
                                    "type": "string",
                                    "description": "Suggested follow-up action"
                                }
                            }
                        }
                    }
                ],
                function_call="auto"
            )
            
            # Extract response
            message = response.choices[0].message
            response_text = message.content or "I'm here to help you find the perfect property. What would you like to know?"
            
            # Extract structured data if function was called
            extracted_info = {}
            if message.function_call and message.function_call.name == "extract_lead_info":
                try:
                    extracted_info = json.loads(message.function_call.arguments)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse function call arguments")
            
            return {
                "response": response_text,
                "extracted_info": extracted_info
            }
            
        except Exception as e:
            logger.error(f"GPT-4 error: {str(e)}")
            # Fallback to simple response
            return {
                "response": self._get_fallback_response(user_message),
                "extracted_info": {}
            }
    
    def _build_conversation_context(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]] = None,
        caller_info: Dict[str, Any] = None
    ) -> List[Dict[str, str]]:
        """Build the conversation context for GPT-4"""
        
        # System prompt - defines CORA's personality and knowledge
        system_prompt = """You are CORA, an AI real estate assistant. You are professional, friendly, and knowledgeable about Austin, Texas properties.

AVAILABLE PROPERTIES:
1. 123 Main Street - $489,000 - 3br/2ba - Downtown Austin - Features: hardwood floors, granite countertops, renovated kitchen, spacious backyard
2. 456 Oak Avenue - $325,000 - 2br/1.5ba - Quiet residential area - Features: modern, recently renovated, low maintenance, HOA included, near schools
3. 789 Pine Lane - $750,000 - 4br/3ba - Luxury estate - Features: pool, smart home technology, hill country views, 3-car garage, half-acre lot

PERSONALITY:
- Enthusiastic but not pushy
- Ask follow-up questions to understand needs
- Offer to schedule showings when appropriate
- Provide specific details about properties
- Remember what the customer has already discussed

CAPABILITIES:
- Property information and details
- Scheduling showings (confirm availability)
- Neighborhood information
- Market insights for Austin
- Financing guidance (basic)

When someone asks about scheduling, be helpful and specific. For example, if they say "Saturday at 2pm", respond with something like "Perfect! I can schedule you for a showing this Saturday at 2:00 PM. Which property would you like to see first - 123 Main Street, 456 Oak Avenue, or 789 Pine Lane? I'll send you a confirmation with the address and my contact information."
"""

        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        if conversation_history:
            for entry in conversation_history[-6:]:  # Keep last 6 exchanges for context
                role = "user" if entry["speaker"] == "user" else "assistant"
                messages.append({"role": role, "content": entry["message"]})
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        return messages
    
    def _get_fallback_response(self, user_message: str) -> str:
        """Fallback response if GPT-4 fails"""
        message_lower = user_message.lower()
        
        if any(word in message_lower for word in ['hello', 'hi', 'hey']):
            return "Hello! I'm CORA, your real estate assistant. I'm here to help you find the perfect property in Austin. What are you looking for today?"
        
        elif any(word in message_lower for word in ['123', 'main']):
            return "123 Main Street is a beautiful 3-bedroom home in downtown Austin for $489,000. It features hardwood floors and a renovated kitchen. Would you like to know more or schedule a showing?"
        
        elif any(word in message_lower for word in ['456', 'oak']):
            return "456 Oak Avenue is a modern 2-bedroom condo for $325,000. It's perfect for first-time buyers and located near excellent schools. Interested in learning more?"
        
        elif any(word in message_lower for word in ['789', 'pine']):
            return "789 Pine Lane is our luxury 4-bedroom estate for $750,000. It features a pool, smart home technology, and stunning hill country views. Would you like to schedule a tour?"
        
        else:
            return "I'd be happy to help you find the perfect property! We have three beautiful options available in Austin. What specific features are you looking for in your next home?"