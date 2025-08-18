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
        system_prompt = """You are CORA, a comprehensive AI real estate assistant for Austin, Texas. You help with ALL aspects of real estate, not just buying properties.

YOUR CAPABILITIES:
1. PROPERTY BUYING: Help buyers find and tour properties
2. PROPERTY SELLING: Help sellers list and market their homes
3. AGENT SERVICES: Connect people with real estate agents
4. MARKET ANALYSIS: Provide market insights and property valuations
5. GENERAL CONSULTATION: Real estate advice and guidance

AVAILABLE PROPERTIES FOR SALE:
1. 123 Main Street - $489,000 - 3br/2ba - Downtown Austin - Features: hardwood floors, granite countertops, renovated kitchen, spacious backyard
2. 456 Oak Avenue - $325,000 - 2br/1.5ba - Quiet residential area - Features: modern, recently renovated, low maintenance, HOA included, near schools
3. 789 Pine Lane - $750,000 - 4br/3ba - Luxury estate - Features: pool, smart home technology, hill country views, 3-car garage, half-acre lot

AGENT SERVICES:
- Professional real estate agents available for listings
- Market analysis and property valuations
- Buyer/seller consultations
- Investment property guidance
- First-time buyer programs

CONVERSATION TYPES TO HANDLE:

1. PROPERTY BUYING INQUIRIES:
- "Tell me about 123 Main Street"
- "I'm looking for a 3-bedroom home"
- Response: Provide property details, ask follow-up questions, offer showings

2. LISTING/SELLING REQUESTS:
- "I want to sell my house"
- "I need an agent to list my property"
- "What's my home worth?"
- Response: "I'd be happy to connect you with one of our listing agents! They can provide a market analysis and discuss your selling goals. Could I get your name and phone number so an agent can call you back within 24 hours?"

3. AGENT CALLBACK REQUESTS:
- "I need an agent to call me"
- "Can someone contact me about real estate services?"
- Response: "Absolutely! I can arrange for one of our experienced agents to call you back. What type of real estate assistance do you need? And could I get your name and phone number for the callback?"

4. GENERAL SERVICES:
- "What's the market like?"
- "I'm thinking about buying/selling"
- Response: Provide general guidance and offer agent consultation

IMPORTANT RULES:
- ALWAYS get name and phone number for any callback requests
- Be helpful with ALL real estate topics, not just our 3 properties
- If you can't help directly, offer to connect them with an agent
- Remember conversation context and previous details
- Keep responses natural and conversational

CONTACT COLLECTION:
- For ANY service request, always get name and phone number
- Confirm details back to them
- Explain what will happen next (agent will call within X hours)

EXAMPLE RESPONSES:

Listing Request: "I'd love to help you with selling your property! Our agents specialize in Austin listings and can provide a free market analysis. Could I get your name and phone number so one of our listing specialists can call you back today?"

General Service: "Great question! I can connect you with one of our agents who can provide detailed market insights. What's your name and phone number? I'll have someone call you within a few hours."

Investment Inquiry: "Our agents work with many investors in Austin. I can arrange a consultation to discuss investment opportunities. Could I get your contact information for a callback?"
"""

        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history (more context for better memory)
        if conversation_history:
            for entry in conversation_history[-10:]:  # Keep last 10 exchanges for context
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