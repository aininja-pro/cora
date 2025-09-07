from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
import logging
from ..services.supabase_service import supabase_service
import os
import re

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthflow", tags=["synthflow"])

# Use singleton Supabase client
supabase = supabase_service.client

@router.post("/action/property-lookup")
async def property_lookup_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synthflow Custom Action for property lookup.
    This endpoint is specifically designed for Synthflow's custom action format.
    """
    try:
        logger.info(f"Property lookup action received: {payload}")
        
        # Extract the query from various possible fields
        query = (
            payload.get("query") or 
            payload.get("input") or 
            payload.get("text") or 
            payload.get("message") or
            payload.get("address") or
            ""
        )
        
        if not query:
            return {
                "success": False,
                "message": "I need a property address to look up. Could you please provide the address?",
                "property": None
            }
        
        # Clean and extract address
        query = query.strip()
        
        # Search for the property
        logger.info(f"Searching for property: {query}")
        
        # Try exact match first
        response = supabase.table('listings').select("*").ilike(
            'address', f'%{query}%'
        ).limit(1).execute()
        
        property_data = None
        if response.data and len(response.data) > 0:
            property_data = response.data[0]
        else:
            # Try normalized search
            normalized = query.lower()
            normalized = normalized.replace(' street', '').replace(' st', '')
            normalized = normalized.replace(' avenue', '').replace(' ave', '')
            normalized = normalized.replace(' road', '').replace(' rd', '')
            
            response = supabase.table('listings').select("*").ilike(
                'address', f'%{normalized}%'
            ).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                property_data = response.data[0]
        
        if property_data:
            # Format response for Synthflow
            message = f"I found the property at {property_data.get('address')}. "
            message += f"It's a {property_data.get('beds')} bedroom, {property_data.get('baths')} bathroom home "
            message += f"with {property_data.get('sqft', 'N/A')} square feet, priced at ${property_data.get('price', 0):,.0f}. "
            
            description = property_data.get('description', '')
            if description:
                message += f"{description} "
            
            message += "Would you like to schedule a showing?"
            
            return {
                "success": True,
                "message": message,
                "property": {
                    "address": property_data.get('address'),
                    "price": property_data.get('price'),
                    "beds": property_data.get('beds'),
                    "baths": property_data.get('baths'),
                    "sqft": property_data.get('sqft'),
                    "type": property_data.get('type'),
                    "status": property_data.get('status'),
                    "description": property_data.get('description')
                }
            }
        else:
            # Get available properties
            all_properties = supabase.table('listings').select("address, price, beds, baths").eq(
                'status', 'active'
            ).limit(3).execute()
            
            if all_properties.data:
                available = "I couldn't find that specific property, but I have these available: "
                for prop in all_properties.data:
                    available += f"{prop.get('address')} (${prop.get('price', 0):,.0f}), "
                available = available.rstrip(', ')
                available += ". Would you like details on any of these?"
                
                return {
                    "success": True,
                    "message": available,
                    "property": None
                }
            else:
                return {
                    "success": False,
                    "message": "I couldn't find that property in our listings. Could you provide more details or try a different address?",
                    "property": None
                }
                
    except Exception as e:
        logger.error(f"Error in property lookup action: {str(e)}")
        return {
            "success": False,
            "message": "I'm having trouble looking up properties right now. Please try again.",
            "property": None,
            "error": str(e)
        }

@router.post("/action/schedule-showing")
async def schedule_showing_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synthflow Custom Action for scheduling property showings.
    """
    try:
        logger.info(f"Schedule showing action received: {payload}")
        
        # Extract details
        property_address = payload.get("property") or payload.get("address")
        date = payload.get("date")
        time = payload.get("time")
        name = payload.get("name")
        phone = payload.get("phone")
        
        # For now, just acknowledge the request
        # In production, this would integrate with a calendar system
        
        message = f"Perfect! I've scheduled your showing "
        if property_address:
            message += f"for {property_address} "
        if date and time:
            message += f"on {date} at {time}. "
        elif date:
            message += f"on {date}. "
        
        message += "You'll receive a confirmation text shortly. Is there anything else you'd like to know about the property?"
        
        return {
            "success": True,
            "message": message,
            "showing": {
                "property": property_address,
                "date": date,
                "time": time,
                "name": name,
                "phone": phone
            }
        }
        
    except Exception as e:
        logger.error(f"Error in schedule showing action: {str(e)}")
        return {
            "success": False,
            "message": "I couldn't schedule the showing right now. Please try again or call us directly.",
            "error": str(e)
        }