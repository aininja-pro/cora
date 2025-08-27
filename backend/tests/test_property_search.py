"""
Tests for property search service
Covers filters, pagination, edge cases, and validation
"""

import pytest
from app.services.property_search_service import PropertySearchService, PropertySearchFilter

@pytest.mark.asyncio
async def test_property_search_validation():
    """Test input validation with defaults and constraints"""
    service = PropertySearchService()
    
    # Test valid filter
    filter = PropertySearchFilter(
        city="Austin",
        min_price=300000,
        max_price=700000,
        beds_min=3,
        page=1,
        page_size=10
    )
    
    assert filter.city == "Austin"
    assert filter.min_price == 300000
    assert filter.status == "active"  # Default
    assert filter.sort == "price_desc"  # Default

@pytest.mark.asyncio
async def test_property_search_edge_cases():
    """Test edge cases and validation limits"""
    
    # Test page validation (minimum 1)
    filter = PropertySearchFilter(page=0)
    assert filter.page == 1
    
    # Test page_size cap (maximum 50)
    filter = PropertySearchFilter(page_size=100)
    assert filter.page_size == 50
    
    # Test invalid sort fallback
    filter = PropertySearchFilter(sort="invalid_sort")
    assert filter.sort == "price_desc"

@pytest.mark.asyncio
async def test_property_search_filters():
    """Test all filter combinations"""
    service = PropertySearchService()
    
    # Test city filter
    filter = PropertySearchFilter(city="Austin", page_size=5)
    result = await service.search(filter, "test_city")
    
    # Should return results format
    assert hasattr(result, 'total')
    assert hasattr(result, 'items')
    assert hasattr(result, 'has_more')
    
    # Test price range
    filter = PropertySearchFilter(min_price=400000, max_price=600000, page_size=5)
    result = await service.search(filter, "test_price")
    
    # Test bedroom/bathroom filters
    filter = PropertySearchFilter(beds_min=3, baths_min=2, page_size=5)
    result = await service.search(filter, "test_beds_baths")
    
@pytest.mark.asyncio 
async def test_property_search_pagination():
    """Test pagination logic"""
    service = PropertySearchService()
    
    # Page 1
    filter1 = PropertySearchFilter(page=1, page_size=2)
    result1 = await service.search(filter1, "test_page1")
    
    # Page 2  
    filter2 = PropertySearchFilter(page=2, page_size=2)
    result2 = await service.search(filter2, "test_page2")
    
    # Results should be different (if enough data)
    if result1.total > 2:
        assert result1.items != result2.items

@pytest.mark.asyncio
async def test_property_search_zero_results():
    """Test handling of no results"""
    service = PropertySearchService()
    
    # Search for impossible criteria
    filter = PropertySearchFilter(
        city="NonexistentCity",
        min_price=10000000,  # Very high price
        page_size=5
    )
    
    result = await service.search(filter, "test_zero")
    
    assert result.total == 0
    assert len(result.items) == 0
    assert result.has_more == False

@pytest.mark.asyncio
async def test_property_search_sorting():
    """Test different sort options"""
    service = PropertySearchService()
    
    # Test price_desc (default)
    filter = PropertySearchFilter(sort="price_desc", page_size=5)
    result = await service.search(filter, "test_sort_price_desc")
    
    # Test price_asc
    filter = PropertySearchFilter(sort="price_asc", page_size=5)
    result = await service.search(filter, "test_sort_price_asc")
    
    # Test newest
    filter = PropertySearchFilter(sort="newest", page_size=5)
    result = await service.search(filter, "test_sort_newest")