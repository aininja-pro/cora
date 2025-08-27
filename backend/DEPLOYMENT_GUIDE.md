# CORA Call Data Capture - Deployment Guide


## Overview
This guide covers deploying the enhanced CORA backend with call data capture, transcript storage, and lead management features.

## Database Setup

### 1. Run the Schema Updates in Supabase
Execute the SQL in `app/db/call_transcripts_schema.sql` in your Supabase SQL editor to create the new tables and update existing ones.

### 2. Verify Tables
Ensure these tables exist in Supabase:
- `calls` (enhanced with new columns)
- `call_transcripts` (new)
- `property_inquiries` (new)
- `lead_capture` (new)

## Configuration

### 1. Update Twilio Webhook
Point your Twilio phone number webhook to the enhanced endpoint:
```
https://cora-backend-epv0.onrender.com/api/twilio-relay/twiml
```

### 2. Environment Variables
Ensure these are set on Render:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ELEVENLABS_API_KEY`
- `TWILIO_SID`
- `TWILIO_TOKEN`

## Testing

### 1. Test Call Flow
1. Call your Twilio number: +1 (316) 867-0416
2. Have a conversation about properties
3. Mention specific addresses like "123 Main Street"
4. Ask about features like bedrooms, price, pool
5. Express interest levels
6. End the call

### 2. Verify Data Capture
Check that the following data was captured:

#### A. Call Record
```bash
curl https://cora-backend-epv0.onrender.com/api/calls/recent
```

#### B. Call Details with Transcript
```bash
curl https://cora-backend-epv0.onrender.com/api/calls/{call_id}
```

#### C. Lead Information
```bash
curl https://cora-backend-epv0.onrender.com/api/calls/leads/all
```

#### D. Property Inquiries
```bash
curl https://cora-backend-epv0.onrender.com/api/calls/properties/inquiries
```

#### E. Dashboard Stats
```bash
curl https://cora-backend-epv0.onrender.com/api/calls/stats/dashboard
```


## API Endpoints

### Call Management
- `GET /api/calls/recent` - Get recent calls
- `GET /api/calls/search` - Search calls with filters
- `GET /api/calls/{call_id}` - Get call details with transcript
- `GET /api/calls/{call_id}/transcript` - Get just the transcript

### Lead Management
- `GET /api/calls/leads/all` - Get all leads
- `GET /api/calls/leads/{phone_number}` - Get lead by phone
- `PUT /api/calls/leads/{lead_id}/status` - Update lead status

### Property Tracking
- `GET /api/calls/properties/inquiries` - Get property inquiries

### Analytics
- `GET /api/calls/stats/dashboard` - Get dashboard statistics

## Monitoring

### 1. Check Logs
Monitor logs on Render for:
- WebSocket connections
- Call session creation
- Transcript entries being saved
- Property inquiries being tracked
- Lead capture events

### 2. Database Queries
Run these queries in Supabase to verify data:

```sql
-- Recent calls
SELECT * FROM calls ORDER BY created_at DESC LIMIT 10;

-- Call transcripts
SELECT * FROM call_transcripts WHERE call_id = 'YOUR_CALL_ID' ORDER BY sequence_number;

-- Property inquiries
SELECT * FROM property_inquiries ORDER BY created_at DESC;

-- Leads
SELECT * FROM lead_capture ORDER BY created_at DESC;
```

## Troubleshooting

### Issue: Calls not being recorded
1. Check Twilio webhook is pointing to correct URL
2. Verify SUPABASE_URL and SUPABASE_KEY are set
3. Check Render logs for database connection errors

### Issue: Transcripts not saving
1. Ensure call_transcripts table exists
2. Check WebSocket connection is maintained
3. Look for errors in Render logs

### Issue: Property inquiries not tracked
1. Verify property_inquiries table exists
2. Check that property addresses match the hardcoded list
3. Review extraction logic in logs

## Next Steps

1. **Add GPT-4 Integration**: Replace hardcoded responses with AI
2. **Real Property Database**: Connect to actual property listings
3. **Email/SMS Follow-up**: Automated lead nurturing
4. **Analytics Dashboard**: Build UI for viewing calls and leads
5. **Call Recording**: Store actual audio recordings
6. **Multi-agent Support**: Route calls to different agents

## Support

For issues or questions:
- Check Render logs: https://dashboard.render.com
- Monitor Supabase: https://app.supabase.com
- Review Twilio console: https://console.twilio.com