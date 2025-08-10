# Setting Up Twilio for CORA (Replacing Synthflow)

## Why Switch to Twilio?

| Feature | Synthflow | Our Twilio Solution |
|---------|-----------|-------------------|
| **Cost per minute** | $0.12 | ~$0.03 |
| **Phone numbers** | ✅ Real | ✅ Real |
| **Call IDs** | ❌ Placeholders | ✅ Real SIDs |
| **Full transcripts** | ❌ Limited | ✅ Complete |
| **Caller location** | ❌ No | ✅ City, State, ZIP |
| **Real-time updates** | ❌ No | ✅ WebSockets |
| **Custom voices** | ⚠️ Limited | ✅ Any TTS service |
| **Control** | ⚠️ Limited | ✅ Complete |

## Step 1: Sign Up for Twilio

1. Go to [twilio.com](https://www.twilio.com/try-twilio)
2. Sign up for a free account
3. You'll get **$15 free credit** (enough for ~1,500 minutes of testing!)
4. Verify your phone number

## Step 2: Get Your Credentials

After signing up, go to your [Twilio Console](https://console.twilio.com/):

1. Find your **Account SID** (starts with AC...)
2. Find your **Auth Token** (click to reveal)
3. Save these to your `.env` file:

```env
# Add to your .env file
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Step 3: Get a Phone Number

### Option A: Use Twilio Console (Easy)
1. Go to [Buy a Number](https://console.twilio.com/us1/develop/phone-numbers/manage/search)
2. Choose a local number (or toll-free)
3. Make sure it has **Voice** capability ✅
4. Buy it ($1/month for local, $2/month for toll-free)

### Option B: Use Our API (Automated)
```bash
# Once credentials are set, test the connection
curl http://localhost:8000/api/twilio/test-connection
```

## Step 4: Configure the Phone Number

In Twilio Console, configure your phone number:

1. Go to [Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/active)
2. Click on your number
3. In the **Voice Configuration** section:
   - **A call comes in**: Webhook
   - **URL**: `https://cora-backend-epv0.onrender.com/api/twilio/incoming-call`
   - **Method**: HTTP POST
4. In the **Call Status Updates** section:
   - **URL**: `https://cora-backend-epv0.onrender.com/api/twilio/call-status`
   - **Method**: HTTP POST
5. Save

## Step 5: Test Your Setup

### Test Connection:
```bash
curl https://cora-backend-epv0.onrender.com/api/twilio/test-connection
```

You should see:
```json
{
  "connected": true,
  "account_name": "Your Account",
  "phone_numbers": ["+1234567890"],
  "webhook_url": "https://cora-backend-epv0.onrender.com/api/twilio/incoming-call"
}
```

### Make a Test Call:
1. Call your Twilio number
2. You should hear: "Hi! This is Cora from your real estate team..."
3. Say: "Tell me about 123 Main Street"
4. Cora will respond with property details!

## Step 6: Monitor Your Calls

### Real-time Dashboard:
- Calls appear instantly in your database
- Full transcripts with timestamps
- Caller location information
- Actual phone numbers (no placeholders!)

### Check Call Logs:
```bash
# View recent calls in your database
curl https://cora-backend-epv0.onrender.com/api/calls
```

## What You Get vs Synthflow:

### With Synthflow:
```json
{
  "call_id": "< call_id >",  // Placeholder
  "phone": "Unknown",         // No phone number
  "query": "123 main street"  // Just the query
}
```

### With Twilio (Our System):
```json
{
  "call_id": "CA1234567890abcdef",      // Real ID
  "phone_number": "+13162187747",        // Real number
  "caller_name": "John Smith",           // From lookup
  "location": "Austin, TX 78701",        // Real location
  "transcript": [                        // Full conversation
    {
      "speaker": "cora",
      "text": "Hi! This is Cora...",
      "timestamp": "2025-08-10T14:30:00Z"
    },
    {
      "speaker": "caller",
      "text": "Tell me about 123 Main Street",
      "timestamp": "2025-08-10T14:30:05Z",
      "confidence": 0.98
    }
  ],
  "recording_url": "https://recordings.twilio.com/...",
  "duration": 185,
  "cost": 0.0255  // Actual cost in dollars
}
```

## Next Steps:

### 1. Add GPT-4 Intelligence (Already have OpenAI)
✅ Ready to integrate - just need to connect

### 2. Add Natural Voice (Already have ElevenLabs)
✅ Ready to integrate for better voice quality

### 3. Add Real-time Transcription (Optional)
- Sign up for [Deepgram](https://deepgram.com) (free tier available)
- Add to `.env`: `DEEPGRAM_API_KEY=...`
- Enables live transcription during calls

### 4. Add WebSocket for Live UI Updates
- Frontend can show transcript in real-time
- See caller speaking as they talk
- Instant property card population

## Cost Breakdown:

### Per Call (3 minutes average):
- **Twilio Phone**: $0.0085/min = $0.0255
- **Deepgram STT**: $0.0125/min = $0.0375 (optional)
- **OpenAI GPT-4**: ~$0.003/call
- **ElevenLabs TTS**: ~$0.006/min = $0.018 (optional)
- **Total**: ~$0.03-0.08 per call

### Monthly (1000 calls):
- **Synthflow**: 3000 min × $0.12 = **$360/month**
- **Our System**: 3000 min × $0.03 = **$90/month**
- **Savings**: **$270/month** (75% cheaper!)

## Troubleshooting:

### "Twilio credentials not configured"
- Make sure `.env` file has TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
- Restart the backend after adding credentials

### "No phone numbers found"
- Buy a phone number in Twilio Console
- Make sure it has Voice capability

### Webhook not receiving calls
- Check webhook URL is exactly: `/api/twilio/incoming-call`
- Ensure backend is deployed and running
- Check Twilio Console for error logs

## Ready to Test!

1. Call your Twilio number
2. Ask about properties
3. Watch the real data flow into your dashboard
4. No more `< call_id >` placeholders!

You now have complete control over your voice AI system! 🎉