"""
GPT-powered call analysis service for extracting insights from call transcripts
"""
import os
import logging
import re
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI
import json

logger = logging.getLogger(__name__)

class CallAnalysisService:
    """Service for analyzing call transcripts using GPT-4"""
    
    def __init__(self):
        """Initialize OpenAI client"""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY must be set")
        
        self.client = AsyncOpenAI(api_key=api_key)
        logger.info("Call Analysis service initialized")
    
    async def analyze_call_transcript(
        self,
        transcript_entries: List[Dict[str, Any]],
        call_info: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Analyze a complete call transcript and extract key information
        """
        try:
            if not transcript_entries or len(transcript_entries) == 0:
                return self._empty_analysis()
            
            # Build conversation text for analysis
            conversation_text = self._build_conversation_text(transcript_entries)
            
            # Create analysis prompt
            system_prompt = """You are an expert real estate call analyst. Analyze ALL types of real estate conversations and extract key information.

CONVERSATION TYPES TO ANALYZE:
- Property inquiries and showings
- Listing consultations (wanting to sell their property)
- General real estate services (market analysis, agent services)
- Referral requests and agent callbacks
- Investment property discussions
- First-time buyer consultations
- Refinancing and market timing questions

Be very careful with name extraction - only extract names that are clearly stated by the caller, not words like "interested", "looking", etc.

Provide a JSON response with this exact structure:
{
  "caller_name": "string or null - only if clearly stated by caller",
  "phone_number": "string or null - if mentioned in conversation", 
  "email": "string or null - if mentioned",
  "call_type": "property_inquiry|listing_consultation|general_service|callback_request|investment|other",
  "property_interests": ["list of specific properties mentioned"],
  "listing_interest": "boolean - true if they want to list/sell property",
  "service_requested": "string or null - what service they want (callback, market analysis, etc.)",
  "budget_mentioned": "number or null - any budget/price range mentioned",
  "bedrooms_wanted": "number or null - bedroom preference",
  "timeline": "string or null - when they want to buy/move/sell",
  "scheduling_requests": "string or null - any appointment requests",
  "callback_requested": "boolean - true if they want agent to call back",
  "lead_quality": "hot|warm|cold - based on engagement level",
  "call_summary": "2-3 sentence summary of the call purpose and outcome",
  "key_highlights": ["list of 2-3 most important points from call"],
  "next_actions": ["list of suggested follow-up actions"],
  "interest_level": "very_high|high|medium|low - based on engagement",
  "urgency": "immediate|this_week|this_month|flexible|unknown",
  "sms_summary": "1-2 sentence SMS-optimized summary under 240 chars with key details: intent, outcome, next action"
}

Lead Quality Guidelines:
- HOT: Provided contact info, requested callback, ready to list/buy, specific timeline, asked for agent services
- WARM: Genuine inquiry, discussed services, showed interest in working with agent, asked good questions
- COLD: Basic inquiry only, didn't provide much info, low engagement

Call Types:
- property_inquiry: Looking to buy/rent specific properties
- listing_consultation: Want to sell their property or get market analysis
- general_service: Need agent services, market info, referrals
- callback_request: Want agent to call them back
- investment: Investment property discussions
- other: Doesn't fit other categories

Available properties: 123 Main Street ($489k), 456 Oak Avenue ($325k), 789 Pine Lane ($750k)"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Analyze this real estate call transcript:\n\n{conversation_text}"}
            ]
            
            # Call GPT-4 for analysis with timeout
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.3,  # Lower temperature for more consistent extraction
                max_tokens=800,
                timeout=15.0  # 15 second timeout
            )
            
            # Parse the JSON response
            analysis_text = response.choices[0].message.content
            
            try:
                # Strip markdown code blocks if present
                clean_text = analysis_text.strip()
                if clean_text.startswith('```json'):
                    clean_text = clean_text[7:]  # Remove ```json
                if clean_text.endswith('```'):
                    clean_text = clean_text[:-3]  # Remove ```
                clean_text = clean_text.strip()
                
                analysis = json.loads(clean_text)
                logger.info(f"Call analysis completed: {analysis.get('caller_name', 'No name')} - {analysis.get('lead_quality', 'unknown')} lead")
                return analysis
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse GPT analysis as JSON: {analysis_text[:200]}...")
                return self._parse_text_analysis(analysis_text)
                
        except Exception as e:
            logger.error(f"Call analysis failed: {str(e)}")
            return self._empty_analysis()
    
    def _build_conversation_text(self, transcript_entries: List[Dict[str, Any]]) -> str:
        """Build readable conversation text from transcript entries"""
        conversation = []
        for entry in transcript_entries:
            speaker = "CALLER" if entry["speaker"] == "user" else "CORA"
            timestamp = entry.get("timestamp", "")
            message = entry.get("message", "")
            conversation.append(f"{speaker}: {message}")
        
        return "\n".join(conversation)
    
    def _parse_text_analysis(self, text: str) -> Dict[str, Any]:
        """Fallback parser if GPT doesn't return valid JSON"""
        # Try to extract basic info from text response
        analysis = self._empty_analysis()
        
        # Look for name patterns in the analysis text
        name_patterns = [
            r"caller_name[\":\s]*([A-Za-z]+)",
            r"name[\":\s]*([A-Za-z]+)",
            r"caller is ([A-Za-z]+)"
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match and len(match.group(1)) > 1:
                analysis["caller_name"] = match.group(1)
                break
        
        # Basic lead quality assessment
        if any(word in text.lower() for word in ["hot", "high interest", "schedule", "appointment"]):
            analysis["lead_quality"] = "hot"
        elif any(word in text.lower() for word in ["warm", "interested", "looking"]):
            analysis["lead_quality"] = "warm"
        else:
            analysis["lead_quality"] = "cold"
        
        analysis["call_summary"] = "Analysis completed but format was unclear"
        analysis["sms_summary"] = f"Call from caller - {analysis['lead_quality']} lead, analysis unclear"
        
        return analysis
    
    def _empty_analysis(self) -> Dict[str, Any]:
        """Return empty analysis structure"""
        return {
            "caller_name": None,
            "phone_number": None,
            "email": None,
            "call_type": "other",
            "property_interests": [],
            "listing_interest": False,
            "service_requested": None,
            "budget_mentioned": None,
            "bedrooms_wanted": None,
            "timeline": None,
            "scheduling_requests": None,
            "callback_requested": False,
            "lead_quality": "cold",
            "call_summary": "No transcript available for analysis",
            "key_highlights": [],
            "next_actions": [],
            "interest_level": "low",
            "urgency": "unknown",
            "sms_summary": "Call received - no transcript available for analysis"
        }