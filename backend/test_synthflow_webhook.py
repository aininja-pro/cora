#!/usr/bin/env python3
"""Test Synthflow webhook locally"""

import requests
import json

# Test payload simulating what Synthflow sends
test_payload = {
    "call_id": "test-call-123",
    "message": "Hi, I'm interested in viewing the property at 123 Main Street. Can you tell me more about it?",
    "from_number": "+1234567890",
    "call": {
        "id": "test-call-123",
        "transcript": "Hi, I'm interested in viewing the property at 123 Main Street. Can you tell me more about it?",
        "from": "+1234567890"
    }
}

# Send to local backend
url = "http://localhost:8000/api/synthflow/webhook"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer test-token"  # Your webhook secret
}

print("Sending test webhook to:", url)
print("Payload:", json.dumps(test_payload, indent=2))
print("-" * 50)

try:
    response = requests.post(url, json=test_payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print("Response:", json.dumps(response.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")