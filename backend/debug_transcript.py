#!/usr/bin/env python3
import os
import sys
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Add the current directory to Python path
sys.path.append(os.path.dirname(__file__))

try:
    from app.services.supabase_service import SupabaseService
    
    supabase = SupabaseService()
    
    print("Testing Supabase connection...")
    
    # Test 1: Check if call_transcripts table exists
    try:
        result = supabase.client.table("call_transcripts").select("*").limit(1).execute()
        print("✅ call_transcripts table exists")
        print(f"Current entries: {len(result.data)}")
    except Exception as e:
        print(f"❌ call_transcripts table error: {e}")
    
    # Test 2: Try a manual insert
    try:
        test_data = {
            "call_id": "9cd36229-582c-440a-8416-613074b1e689",
            "speaker": "user", 
            "message": "Test transcript insert",
            "timestamp": "2025-08-29T19:15:00.000Z",
            "sequence_number": 999999999
        }
        
        result = supabase.client.table("call_transcripts").insert(test_data).execute()
        print("✅ Manual insert succeeded")
        print(f"Inserted: {result.data}")
        
    except Exception as e:
        print(f"❌ Manual insert failed: {e}")
        
except ImportError as e:
    print(f"❌ Import error: {e}")