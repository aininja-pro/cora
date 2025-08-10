# Synthflow Integration Testing Guide

## Updates Made

### 1. Enhanced Variable Capture
The webhook now tries multiple field names to capture:
- **Call ID**: `call_id`, `callId`, `id`, `session_id`, `sessionId`
- **Phone Number**: `from_number`, `phone`, `phone_number`, `phoneNumber`, `from`, `caller`, `caller_phone`, `callerPhone`
- **Transcript**: `transcript`, `full_transcript`, `conversation`, `history`, `call_transcript`

### 2. Call-End Webhook Enhancement
The `/api/synthflow/call-ended` endpoint now:
- Captures complete call data including duration, recording URL, and full transcript
- Updates existing call records with complete information
- Extracts caller information, summary, and any custom variables

### 3. Debug Endpoints
New endpoints for troubleshooting:
- `GET /api/synthflow/debug/payloads` - View last 10 webhook payloads
- `POST /api/synthflow/debug/test-webhook` - Test data extraction logic

## Testing Steps

### 1. Check Debug Payloads
After making a test call through Synthflow:
```bash
curl https://cora-backend-epv0.onrender.com/api/synthflow/debug/payloads
```

This will show you exactly what Synthflow is sending.

### 2. Test the Webhook Manually
You can test the webhook with different payload structures:
```bash
curl -X POST https://cora-backend-epv0.onrender.com/api/synthflow/debug/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-123",
    "phone": "+1234567890",
    "query": "Tell me about 123 Main Street"
  }'
```

### 3. Update Synthflow Configuration

#### In Synthflow's Custom Action settings:

**For the main webhook:**
- URL: `https://cora-backend-epv0.onrender.com/api/synthflow/webhook`
- Trigger: During the Call
- Request Body: Try these variations to see which works:

Option A (Current):
```json
{
  "query": "<user_query>",
  "call_id": "<call_id>"
}
```

Option B (With more variables):
```json
{
  "query": "<user_query>",
  "call_id": "<session_id>",
  "phone": "<caller_phone>",
  "transcript": "<conversation_transcript>"
}
```

Option C (Using Synthflow variables):
```json
{
  "query": "{{user_query}}",
  "call_id": "{{session_id}}",
  "phone": "{{caller_phone}}",
  "transcript": "{{conversation_transcript}}"
}
```

**For the call-end webhook:**
- URL: `https://cora-backend-epv0.onrender.com/api/synthflow/call-ended`
- Trigger: After the Call
- Request Body:
```json
{
  "call_id": "<session_id>",
  "duration": "<call_duration>",
  "phone": "<caller_phone>",
  "transcript": "<full_transcript>",
  "recording_url": "<recording_url>"
}
```

### 4. Monitor Logs
The backend now logs extensively. Check Render logs:
1. Go to Render Dashboard
2. Click on the CORA backend service
3. Go to "Logs" tab
4. Look for sections marked with `========` for webhook data

### 5. Verify in Database
After calls, check Supabase to see if phone numbers and full transcripts are being saved:
1. Go to Supabase dashboard
2. Check the `calls` table
3. Look for:
   - `phone_number` field (should not be "Unknown")
   - `transcript` field (should have full conversation)
   - `metadata` field (should contain extracted data)

## Common Issues & Solutions

### Issue: Still getting placeholder values
**Solution**: Try using double curly braces `{{variable}}` instead of angle brackets `<variable>` in Synthflow

### Issue: Phone number not captured
**Solution**: Check if Synthflow provides this in a different field like `{{from_number}}` or `{{caller.phone}}`

### Issue: No call-end webhook received
**Solution**: Ensure "After the Call" trigger is properly configured in Synthflow

## Next Steps After Testing

1. Once you identify which field names Synthflow uses, we can optimize the code
2. If Synthflow doesn't send certain data, we may need to:
   - Use their API to fetch call details
   - Contact their support for proper variable names
   - Use a different integration method

## Support Resources

- Synthflow Documentation: Check their docs for webhook variable reference
- Synthflow Support: Contact them about variable substitution issues
- Our Debug Endpoint: Use `/api/synthflow/debug/payloads` to see raw data