from fastapi import APIRouter
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

@router.post("/test")
async def test_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Simple test endpoint for Synthflow that responds immediately."""
    logger.info(f"Test endpoint received: {payload}")
    
    # Extract the query
    query = payload.get("query", "")
    
    # Simple response for testing
    if "123 main" in query.lower():
        return {
            "success": True,
            "message": "The property at 123 Main Street is a beautiful 3 bedroom, 2.5 bathroom home priced at $489,000. It features 2200 square feet, a modern kitchen, and a spacious backyard. Would you like to schedule a showing?"
        }
    else:
        return {
            "success": True,
            "message": "I can help you with property information. Which property address are you interested in?"
        }