"""
Hybrid response service - instant responses for common queries, GPT-4 for complex conversations
"""
import logging
import re
from typing import Dict, Any, List, Optional, Tuple
from .gpt_service import GPTService

logger = logging.getLogger(__name__)

class ResponseService:
    """Manages both instant and intelligent responses"""
    
    def __init__(self):
        self.gpt_service = None
        
    async def get_response(
        self, 
        user_message: str, 
        conversation_history: List[Dict[str, str]] = None,
        caller_info: Dict[str, Any] = None
    ) -> Tuple[str, Dict[str, Any], bool]:
        """
        Get response - returns (response_text, extracted_info, used_gpt)
        """
        
        # Check for instant response first
        instant_response = self._get_instant_response(user_message, conversation_history)
        if instant_response:
            return instant_response, {}, False
        
        # Use GPT-4 for complex responses
        try:
            if not self.gpt_service:
                self.gpt_service = GPTService()
            
            result = await self.gpt_service.generate_property_response(
                user_message=user_message,
                conversation_history=conversation_history,
                caller_info=caller_info
            )
            
            return result["response"], result.get("extracted_info", {}), True
            
        except Exception as e:
            logger.warning(f"GPT failed, using fallback: {str(e)}")
            fallback = self._get_fallback_response(user_message)
            return fallback, {}, False
    
    def _get_instant_response(self, user_message: str, conversation_history: List = None) -> Optional[str]:
        """Get instant response for common queries"""
        message_lower = user_message.lower().strip()
        
        # Greetings - instant response
        if any(word in message_lower for word in ['hello', 'hi', 'hey', 'good morning', 'good afternoon']):
            return "Hi there! I'm CORA, your real estate assistant. I can help you with information about our properties in Austin. What are you looking for?"
        
        # Simple property inquiries - instant response
        if '123 main' in message_lower or 'main street' in message_lower:
            return "123 Main Street is a beautiful 3-bedroom, 2-bathroom home in downtown Austin for $489,000. It has hardwood floors, granite countertops, and a renovated kitchen. Would you like more details or to schedule a showing?"
        
        if '456 oak' in message_lower or 'oak avenue' in message_lower:
            return "456 Oak Avenue is a modern 2-bedroom condo for $325,000 in a quiet area near schools. It's recently renovated and low-maintenance with HOA included. Perfect for first-time buyers. Interested in learning more?"
        
        if '789 pine' in message_lower or 'pine lane' in message_lower:
            return "789 Pine Lane is our luxury 4-bedroom estate for $750,000. It features a pool, smart home technology, hill country views, and a 3-car garage on half an acre. Would you like to schedule a tour?"
        
        # Simple price inquiries - instant response
        if any(word in message_lower for word in ['price', 'cost', 'how much']) and len(message_lower.split()) <= 6:
            return "We have properties starting at $325,000 for a 2-bedroom condo, $489,000 for a 3-bedroom home, and $750,000 for our luxury estate. What's your ideal price range?"
        
        # Simple bedroom inquiries - instant response
        if re.search(r'\b(2|two)\s*(bed|bedroom)', message_lower):
            return "For 2 bedrooms, I'd recommend 456 Oak Avenue at $325,000. It's a modern condo in a great location near schools. Would you like more details?"
        
        if re.search(r'\b(3|three)\s*(bed|bedroom)', message_lower):
            return "For 3 bedrooms, 123 Main Street would be perfect - $489,000 in downtown Austin with hardwood floors and a renovated kitchen. Should I tell you more?"
        
        if re.search(r'\b(4|four)\s*(bed|bedroom)', message_lower):
            return "For 4 bedrooms, you'll love 789 Pine Lane - our luxury estate at $750,000 with a pool and smart home features. Want to schedule a tour?"
        
        # Simple thanks/goodbye - instant response
        if any(word in message_lower for word in ['thank', 'thanks', 'bye', 'goodbye']) and len(message_lower.split()) <= 4:
            return "You're welcome! Feel free to call back anytime if you have more questions. Have a great day!"
        
        # Simple yes/no responses - instant response
        if message_lower in ['yes', 'yeah', 'yep', 'sure', 'okay', 'ok']:
            return "Great! What would you like to know?"
        
        if message_lower in ['no', 'nope', 'not interested']:
            return "No problem! Is there anything else I can help you with today?"
        
        # No instant response available - use GPT-4
        return None
    
    def _get_fallback_response(self, user_message: str) -> str:
        """Fallback response if everything fails"""
        return "I'm here to help you with information about our Austin properties. We have a 2-bedroom condo, a 3-bedroom home, and a 4-bedroom luxury estate. What would you like to know?"
    
    def _should_use_gpt(self, user_message: str, conversation_history: List = None) -> bool:
        """Determine if we should use GPT-4 for this message"""
        message_lower = user_message.lower()
        
        # Use GPT for complex scenarios
        complex_keywords = [
            'schedule', 'appointment', 'showing', 'tour', 'visit',
            'when', 'available', 'name', 'phone', 'contact',
            'neighborhood', 'school', 'area', 'financing',
            'mortgage', 'qualify', 'timeline', 'moving'
        ]
        
        # Use GPT if message contains complex keywords
        if any(keyword in message_lower for keyword in complex_keywords):
            return True
        
        # Use GPT if conversation history suggests we're in middle of complex flow
        if conversation_history and len(conversation_history) > 2:
            recent_messages = [entry["message"].lower() for entry in conversation_history[-3:]]
            if any(keyword in msg for msg in recent_messages for keyword in complex_keywords):
                return True
        
        # Use GPT for longer, more detailed messages
        if len(user_message.split()) > 8:
            return True
        
        return False