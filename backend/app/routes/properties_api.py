"""
API endpoints for managing property listings
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
from pydantic import BaseModel
from ..services.supabase_service import SupabaseService
from ..services.property_search_service import property_search_service, PropertySearchFilter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/properties", tags=["properties"])

@router.get("/search")
async def search_properties(
    city: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    beds_min: Optional[int] = None,
    baths_min: Optional[float] = None,
    status: Optional[str] = "active",
    page: int = 1,
    page_size: int = 10,
    sort: str = "price_desc"
) -> Dict[str, Any]:
    """
    Search properties using shared service (used by UI)
    """
    try:
        search_filter = PropertySearchFilter(
            city=city,
            min_price=min_price,
            max_price=max_price,
            beds_min=beds_min,
            baths_min=baths_min,
            status=status,
            page=page,
            page_size=page_size,
            sort=sort
        )
        
        result = await property_search_service.search(search_filter, f"ui_search_{page}")
        
        return {
            "success": True,
            "total": result.total,
            "properties": [prop.dict() for prop in result.items],
            "page": result.page,
            "page_size": result.page_size,
            "has_more": result.has_more
        }
        
    except Exception as e:
        logger.error(f"Property search failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "total": 0,
            "properties": [],
            "page": page,
            "page_size": page_size,
            "has_more": False
        }

class PropertyCreate(BaseModel):
    address: str
    price: float
    beds: int
    baths: float
    sqft: int
    type: str  # house, condo, townhouse, land, commercial, other
    description: str
    status: str = "active"  # active, pending, sold, inactive
    photos: Optional[List[str]] = []  # Array of image URLs

class PropertyUpdate(BaseModel):
    address: Optional[str] = None
    price: Optional[float] = None
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    photos: Optional[List[str]] = None  # Array of image URLs

@router.get("/")
async def get_all_properties(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100, description="Number of properties to retrieve")
) -> Dict[str, Any]:
    """
    Get all properties with optional status filter
    """
    try:
        supabase = SupabaseService()
        
        # Build query
        query = supabase.client.table("listings").select("*")
        
        if status:
            query = query.eq("status", status)
        
        response = query.order("created_at", desc=True).limit(limit).execute()
        
        properties = response.data or []
        
        return {
            "success": True,
            "count": len(properties),
            "properties": properties
        }
        
    except Exception as e:
        logger.error(f"Error fetching properties: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch properties")

@router.get("/{property_id}")
async def get_property(property_id: str) -> Dict[str, Any]:
    """
    Get a specific property by ID
    """
    try:
        supabase = SupabaseService()
        
        response = supabase.client.table("listings").select("*").eq("id", property_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Property not found")
        
        property_data = response.data[0]
        
        return {
            "success": True,
            "property": property_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching property: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch property")

@router.post("/")
async def create_property(property_data: PropertyCreate) -> Dict[str, Any]:
    """
    Create a new property listing
    """
    try:
        # Validate property type
        valid_types = ['house', 'condo', 'townhouse', 'land', 'commercial', 'other']
        if property_data.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid property type. Must be one of: {valid_types}")
        
        # Validate status
        valid_statuses = ['active', 'pending', 'sold', 'inactive']
        if property_data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        supabase = SupabaseService()
        
        # For now, use a default agent_id (in production, this would come from authentication)
        # This assumes the demo agent exists from sample_data.sql
        default_agent_id = '11111111-1111-1111-1111-111111111111'
        
        # Create property data
        property_dict = {
            "agent_id": default_agent_id,
            "address": property_data.address,
            "price": property_data.price,
            "beds": property_data.beds,
            "baths": property_data.baths,
            "sqft": property_data.sqft,
            "type": property_data.type,
            "description": property_data.description,
            "status": property_data.status,
            "photos": property_data.photos,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        response = supabase.client.table("listings").insert(property_dict).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create property")
        
        created_property = response.data[0]
        
        return {
            "success": True,
            "message": "Property created successfully",
            "property": created_property
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating property: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create property")

@router.put("/{property_id}")
async def update_property(property_id: str, property_data: PropertyUpdate) -> Dict[str, Any]:
    """
    Update an existing property
    """
    try:
        supabase = SupabaseService()
        
        # Check if property exists
        existing = supabase.client.table("listings").select("*").eq("id", property_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Property not found")
        
        # Build update data (only include fields that were provided)
        update_data = {}
        for field, value in property_data.model_dump(exclude_unset=True).items():
            update_data[field] = value
        
        # Validate property type if provided
        if "type" in update_data:
            valid_types = ['house', 'condo', 'townhouse', 'land', 'commercial', 'other']
            if update_data["type"] not in valid_types:
                raise HTTPException(status_code=400, detail=f"Invalid property type. Must be one of: {valid_types}")
        
        # Validate status if provided
        if "status" in update_data:
            valid_statuses = ['active', 'pending', 'sold', 'inactive']
            if update_data["status"] not in valid_statuses:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        # Add updated timestamp
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        response = supabase.client.table("listings").update(update_data).eq("id", property_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to update property")
        
        updated_property = response.data[0]
        
        return {
            "success": True,
            "message": "Property updated successfully",
            "property": updated_property
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating property: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update property")

@router.delete("/{property_id}")
async def delete_property(property_id: str) -> Dict[str, Any]:
    """
    Delete a property listing
    """
    try:
        supabase = SupabaseService()
        
        # Check if property exists
        existing = supabase.client.table("listings").select("*").eq("id", property_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Property not found")
        
        response = supabase.client.table("listings").delete().eq("id", property_id).execute()
        
        return {
            "success": True,
            "message": "Property deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting property: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete property")

@router.get("/search/by-address")
async def search_properties_by_address(
    query: str = Query(..., description="Address search query"),
    limit: int = Query(10, ge=1, le=50, description="Number of results to return")
) -> Dict[str, Any]:
    """
    Search properties by address
    """
    try:
        supabase = SupabaseService()
        
        # Use ilike for case-insensitive partial matching
        response = supabase.client.table("listings").select("*").ilike("address", f"%{query}%").order("created_at", desc=True).limit(limit).execute()
        
        properties = response.data or []
        
        return {
            "success": True,
            "query": query,
            "count": len(properties),
            "properties": properties
        }
        
    except Exception as e:
        logger.error(f"Error searching properties: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search properties")