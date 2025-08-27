"""
Shared property search service for UI and voice tools
Single source of truth for property queries with validation and pagination
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, validator
import logging
from .supabase_service import SupabaseService

logger = logging.getLogger(__name__)

class PropertySearchFilter(BaseModel):
    """Validated search filter with defaults"""
    city: Optional[str] = None
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    beds_min: Optional[int] = None
    baths_min: Optional[float] = None
    status: Optional[str] = "active"
    page: int = 1
    page_size: int = 10
    sort: str = "price_desc"
    
    @validator('page')
    def validate_page(cls, v):
        return max(1, v)
    
    @validator('page_size')
    def validate_page_size(cls, v):
        return min(50, max(1, v))  # Cap at 50 results
    
    @validator('sort')
    def validate_sort(cls, v):
        valid_sorts = ['price_asc', 'price_desc', 'newest', 'beds_desc', 'sqft_desc']
        return v if v in valid_sorts else 'price_desc'

class PropertyResult(BaseModel):
    """Normalized property result"""
    id: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    price: float
    beds: int
    baths: float
    sqft: int
    status: str
    type: str
    mls_id: Optional[str] = None
    photos: List[str] = []
    features: List[str] = []
    distance_mi: Optional[float] = None

class PropertySearchResult(BaseModel):
    """Search result with metadata"""
    total: int
    items: List[PropertyResult]
    page: int
    page_size: int
    has_more: bool

class PropertySearchService:
    """Shared property search service"""
    
    def __init__(self):
        self.supabase = SupabaseService()
    
    async def search(self, filter: PropertySearchFilter, request_id: str = "unknown") -> PropertySearchResult:
        """
        Execute property search with validation and pagination
        Used by both UI and voice tools
        """
        try:
            logger.info(f"[{request_id}] Property search: {filter.dict()}")
            
            # Build query
            query = self.supabase.client.table("listings").select("*")
            
            # Apply filters
            if filter.city:
                # Search in address field (TODO: add separate city column or view)
                query = query.ilike("address", f"%{filter.city}%")
            
            if filter.min_price:
                query = query.gte("price", filter.min_price)
            
            if filter.max_price:
                query = query.lte("price", filter.max_price)
            
            if filter.beds_min:
                query = query.gte("beds", filter.beds_min)
            
            if filter.baths_min:
                query = query.gte("baths", filter.baths_min)
            
            if filter.status:
                query = query.eq("status", filter.status)
            
            # Apply sorting
            if filter.sort == "price_asc":
                query = query.order("price", desc=False)
            elif filter.sort == "price_desc":
                query = query.order("price", desc=True)
            elif filter.sort == "newest":
                query = query.order("created_at", desc=True)
            elif filter.sort == "beds_desc":
                query = query.order("beds", desc=True)
            elif filter.sort == "sqft_desc":
                query = query.order("sqft", desc=True)
            
            # Get total count (for pagination)
            count_query = self.supabase.client.table("listings").select("*", count="exact", head=True)
            # Apply same filters to count query
            if filter.city:
                count_query = count_query.ilike("address", f"%{filter.city}%")
            if filter.min_price:
                count_query = count_query.gte("price", filter.min_price)
            if filter.max_price:
                count_query = count_query.lte("price", filter.max_price)
            if filter.beds_min:
                count_query = count_query.gte("beds", filter.beds_min)
            if filter.baths_min:
                count_query = count_query.gte("baths", filter.baths_min)
            if filter.status:
                count_query = count_query.eq("status", filter.status)
            
            # Execute count query
            count_result = count_query.execute()
            total = count_result.count or 0
            
            # Apply pagination
            start = (filter.page - 1) * filter.page_size
            end = start + filter.page_size - 1
            query = query.range(start, end)
            
            # Execute main query
            result = query.execute()
            properties = result.data or []
            
            # Transform to normalized format
            items = []
            for prop in properties:
                # Extract city/state/zip from address if possible
                address_parts = self._parse_address(prop.get("address", ""))
                
                items.append(PropertyResult(
                    id=str(prop["id"]),
                    address=prop["address"],
                    city=address_parts.get("city"),
                    state=address_parts.get("state"),
                    zip=address_parts.get("zip"),
                    price=float(prop["price"] or 0),
                    beds=int(prop["beds"] or 0),
                    baths=float(prop["baths"] or 0),
                    sqft=int(prop["sqft"] or 0),
                    status=prop["status"] or "active",
                    type=prop.get("type", "house"),
                    mls_id=prop.get("mls_id"),
                    photos=prop.get("photos") or [],
                    features=prop.get("features") or []
                ))
            
            has_more = start + len(items) < total
            
            logger.info(f"[{request_id}] Property search: {len(items)}/{total} results, page {filter.page}")
            
            return PropertySearchResult(
                total=total,
                items=items,
                page=filter.page,
                page_size=filter.page_size,
                has_more=has_more
            )
            
        except Exception as e:
            logger.error(f"[{request_id}] Property search failed: {str(e)}")
            # Return empty result on error
            return PropertySearchResult(
                total=0,
                items=[],
                page=filter.page,
                page_size=filter.page_size,
                has_more=False
            )
    
    def _parse_address(self, address: str) -> Dict[str, Optional[str]]:
        """
        Parse city, state, zip from address string
        TODO: Replace with proper address parsing or separate city column
        """
        if not address:
            return {"city": None, "state": None, "zip": None}
        
        parts = address.split(", ")
        if len(parts) >= 3:
            # Format: "123 Main St, Austin, TX 78701"
            city = parts[-2].strip()
            state_zip = parts[-1].strip().split()
            state = state_zip[0] if state_zip else None
            zip_code = state_zip[1] if len(state_zip) > 1 else None
            return {"city": city, "state": state, "zip": zip_code}
        elif len(parts) >= 2:
            # Format: "123 Main St, Austin TX"
            city_state = parts[-1].strip().split()
            city = " ".join(city_state[:-1]) if len(city_state) > 1 else city_state[0]
            state = city_state[-1] if len(city_state) > 1 else None
            return {"city": city, "state": state, "zip": None}
        
        return {"city": None, "state": None, "zip": None}

# Global service instance
property_search_service = PropertySearchService()