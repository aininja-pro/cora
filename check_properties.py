import os
from supabase import create_client
import json

supabase = create_client(
    'https://ifxuzsckpcrzgbknwyfr.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeHV6c2NrcGNyemdia253eWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNjk4NTEsImV4cCI6MjA2OTY0NTg1MX0.TdEGrlG0lAaWQmwPixMuHjDJU-YTR6TeO2WPk-u_yZs'
)

# Check if properties table exists
try:
    response = supabase.table('properties').select('*').limit(5).execute()
    print('Properties found:', len(response.data))
    for p in response.data[:3]:
        print(f"  - {p.get('address', 'No address')}: ${p.get('price', 0):,}")
except:
    # Try listings table
    try:
        response = supabase.table('listings').select('*').limit(5).execute()
        print('Listings found:', len(response.data))
        for p in response.data[:3]:
            print(f"  - {p.get('address', 'No address')}: ${p.get('price', 0):,}")
    except Exception as e:
        print('No properties found:', str(e))