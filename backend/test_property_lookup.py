#!/usr/bin/env python3
"""Test property lookup functionality"""

import os
import asyncio
from dotenv import load_dotenv
from app.services.call_handler import CallHandler

load_dotenv()

async def test_property_lookup():
    """Test various property lookups"""
    handler = CallHandler()
    
    test_queries = [
        "123 Main Street",
        "123 main street",
        "123 Main St",
        "123 Main",
        "456 Oak Avenue",
        "789 Maple Drive"
    ]
    
    print("Testing property lookups...")
    print("=" * 50)
    
    for query in test_queries:
        print(f"\nSearching for: '{query}'")
        result = await handler._get_property_info(query)
        if result:
            print(f"  ✓ Found: {result.get('address')}")
            print(f"    Price: ${result.get('price', 0):,}")
            print(f"    Beds: {result.get('beds')}, Baths: {result.get('baths')}")
        else:
            print(f"  ✗ Not found")
    
    print("\n" + "=" * 50)
    print("Listing all properties in database:")
    all_props = await handler._get_all_properties()
    for prop in all_props[:5]:
        print(f"  - {prop.get('address')}: ${prop.get('price', 0):,}")

if __name__ == "__main__":
    asyncio.run(test_property_lookup())