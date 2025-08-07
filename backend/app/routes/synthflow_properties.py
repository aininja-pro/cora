from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import logging
from supabase import create_client
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

# Initialize Supabase client
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

@router.post("/properties/list")
async def list_all_properties(payload: Dict[str, Any] = {}) -> Dict[str, Any]:
    """
    Returns all available properties from the database.
    Since Synthflow doesn't send the user's query, we'll return all properties.
    """
    try:
        # Log what we receive (probably empty)
        logger.info(f"Properties list endpoint - Received: {payload}")
        
        # Get all active properties from database
        response = supabase.table('listings').select("*").eq(
            'status', 'active'
        ).limit(3).execute()
        
        if response.data and len(response.data) > 0:
            # Format properties into a spoken response
            properties = response.data
            
            # Build response message
            message = f"I have {len(properties)} properties available. "
            
            for i, prop in enumerate(properties, 1):
                message += f"Property {i}: {prop.get('address')}, "
                message += f"a {prop.get('beds')} bedroom, {prop.get('baths')} bathroom home "
                message += f"with {prop.get('sqft', 'N/A')} square feet, "
                message += f"priced at ${prop.get('price', 0):,.0f}. "
                
                if prop.get('description'):
                    # Add first sentence of description
                    desc = prop.get('description').split('.')[0]
                    message += f"{desc}. "
            
            message += "Would you like more details about any of these properties?"
            
            return {
                "success": True,
                "message": message,
                "properties": properties,
                "count": len(properties)
            }
        else:
            return {
                "success": True,
                "message": "I'm sorry, I don't have any properties available at the moment. Please check back later or contact our office directly.",
                "properties": [],
                "count": 0
            }
            
    except Exception as e:
        logger.error(f"Error fetching properties: {str(e)}")
        return {
            "success": False,
            "message": "I'm having trouble accessing the property listings right now. Please try again in a moment.",
            "error": str(e)
        }

@router.post("/properties/first")
async def get_first_property(payload: Dict[str, Any] = {}) -> Dict[str, Any]:
    """
    Returns details about the first property in the database.
    Simple endpoint for testing database connectivity.
    """
    try:
        # Get first active property
        response = supabase.table('listings').select("*").eq(
            'status', 'active'
        ).limit(1).execute()
        
        if response.data and len(response.data) > 0:
            prop = response.data[0]
            
            message = f"Here's a featured property at {prop.get('address')}: "
            message += f"It's a {prop.get('beds')} bedroom, {prop.get('baths')} bathroom {prop.get('type', 'home')} "
            message += f"with {prop.get('sqft', 'N/A')} square feet, priced at ${prop.get('price', 0):,.0f}. "
            
            if prop.get('description'):
                message += prop.get('description')
            
            message += " Would you like to schedule a showing?"
            
            return {
                "success": True,
                "message": message,
                "property": prop
            }
        else:
            return {
                "success": True,
                "message": "I don't have any properties available at the moment.",
                "property": None
            }
            
    except Exception as e:
        logger.error(f"Error fetching first property: {str(e)}")
        return {
            "success": False,
            "message": "I'm having trouble accessing property information.",
            "error": str(e)
        }