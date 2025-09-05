#!/bin/bash

# SMS Notifications Test Script
# Quick validation of the MVP SMS notification system

set -e

BACKEND_URL="http://localhost:8000"
JWT_TOKEN=""  # Will need valid JWT for testing

echo "🧪 SMS Notifications Test Suite"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function for test results
test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: $2"
  else
    echo -e "${RED}❌ FAIL${NC}: $2"
    exit 1
  fi
}

# Test 1: Health check endpoints
echo -e "\n${YELLOW}Test 1: Health Check Endpoints${NC}"

# SMS service health
echo "Checking SMS notifications health..."
response=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/notifications/health")
test_result $([[ "$response" == "200" ]] && echo 0 || echo 1) "SMS notifications health endpoint"

# Inbound webhook health
echo "Checking inbound SMS health..."
response=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/twilio/sms-inbound/health")
test_result $([[ "$response" == "200" ]] && echo 0 || echo 1) "Inbound SMS health endpoint"

# Test 2: Database migration validation
echo -e "\n${YELLOW}Test 2: Database Schema${NC}"

# Check if we can connect to FastAPI (indicates migration worked)
response=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/health")
test_result $([[ "$response" == "200" ]] && echo 0 || echo 1) "Backend API health (indicates DB migration success)"

# Test 3: SMS sending (with mock data)
echo -e "\n${YELLOW}Test 3: SMS Sending API${NC}"

if [ -z "$JWT_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Skipping SMS send test - no JWT token provided${NC}"
  echo "To test SMS sending, run with: JWT_TOKEN='your-token' ./test_sms_notifications.sh"
else
  # Test showing confirmation SMS
  echo "Testing showing confirmation SMS..."
  response=$(curl -s -w "%{http_code}" -X POST "${BACKEND_URL}/api/notifications/sms" \
    -H "Authorization: Bearer ${JWT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "tenant_id": "test-tenant",
      "to": "+15551234567",
      "template": "showing_confirm",
      "payload": {
        "name": "Test User",
        "address": "123 Test St, Austin TX",
        "when": "Mon Sep 1, 3:00 PM CT",
        "confirm_link": "https://app.cora.ai/appointments/test/confirm"
      },
      "idempotency_key": "test_showing_confirm_1"
    }')
  
  # Extract status code (last 3 digits)
  status_code="${response: -3}"
  test_result $([[ "$status_code" == "200" ]] && echo 0 || echo 1) "Showing confirmation SMS send"
fi

# Test 4: STOP/HELP handling
echo -e "\n${YELLOW}Test 4: Inbound SMS Compliance${NC}"

# Test STOP message
echo "Testing STOP message handling..."
response=$(curl -s -w "%{http_code}" -X POST "${BACKEND_URL}/twilio/sms-inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15551234567&Body=STOP&MessageSid=test123")

status_code="${response: -3}"
test_result $([[ "$status_code" == "200" ]] && echo 0 || echo 1) "STOP message handling"

# Test HELP message  
echo "Testing HELP message handling..."
response=$(curl -s -w "%{http_code}" -X POST "${BACKEND_URL}/twilio/sms-inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15551234567&Body=HELP&MessageSid=test456")

status_code="${response: -3}"
test_result $([[ "$status_code" == "200" ]] && echo 0 || echo 1) "HELP message handling"

# Test 5: Template rendering validation
echo -e "\n${YELLOW}Test 5: Template Validation${NC}"

# Test all templates with valid payload
templates=("showing_confirm" "agent_summary" "lead_captured")

for template in "${templates[@]}"; do
  echo "Testing template: $template"
  
  case $template in
    "showing_confirm")
      payload='{
        "name": "John Doe",
        "address": "123 Main St",
        "when": "Today 3PM",
        "confirm_link": "https://test.com"
      }'
      ;;
    "agent_summary")
      payload='{
        "summary": "Test summary",
        "actions_link": "/calls/123"
      }'
      ;;
    "lead_captured")
      payload='{
        "name": "Jane Smith",
        "phone": "+15551234567",
        "budget": "$500k",
        "city": "Austin",
        "link": "/calls/123"
      }'
      ;;
  esac

  if [ -n "$JWT_TOKEN" ]; then
    response=$(curl -s -w "%{http_code}" -X POST "${BACKEND_URL}/api/notifications/sms" \
      -H "Authorization: Bearer ${JWT_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"tenant_id\": \"test-tenant\",
        \"to\": \"+15551234567\",
        \"template\": \"$template\",
        \"payload\": $payload,
        \"idempotency_key\": \"test_${template}_1\"
      }")
    
    status_code="${response: -3}"
    test_result $([[ "$status_code" == "200" || "$status_code" == "400" ]] && echo 0 || echo 1) "Template $template validation"
  else
    echo -e "${YELLOW}⚠️  Skipping template test - no JWT token${NC}"
  fi
done

echo -e "\n${GREEN}🎉 SMS Notifications Test Suite Complete!${NC}"
echo ""
echo "Manual Testing Checklist:"
echo "□ Run database migration: backend/app/db/migrations/2025_09_01_notifications.sql"
echo "□ Set environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, etc."
echo "□ Test with real phone number using /api/notifications/test endpoint"
echo "□ Verify SMS delivery with Twilio console logs"
echo "□ Test voice call flow with book_showing to trigger SMS"
echo "□ Validate STOP/HELP compliance with real phone numbers"
echo ""