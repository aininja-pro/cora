# ElevenLabs Voice Integration

## Overview
We've integrated ElevenLabs to provide high-quality, natural-sounding AI voices for CORA. This replaces the robotic Twilio voices with professional, human-like speech.

## Key Features
- **Natural Voice Quality**: Professional voice actors recorded by ElevenLabs
- **Multiple Voice Options**: 8 different voices to choose from
- **Smart Fallback**: Automatically falls back to Twilio if ElevenLabs fails
- **Optimized Settings**: Pre-configured for clarity and natural speech

## Available Voices

| Voice Name | Voice ID | Description |
|------------|----------|-------------|
| **Rachel** (Default) | 21m00Tcm4TlvDq8ikWAM | Clear, professional American female |
| Adam | pNInz6obpgDQGcFmaJgB | Deep, authoritative American male |
| Bella | EXAVITQu4vr4xnSDxMaL | Soft, friendly American female |
| Antoni | ErXwobaYiN019PkySvjV | Well-rounded American male |
| Elli | MF3mGyEYCl7XYWbV9V6O | Young, energetic American female |
| Josh | TxGEqnHWrfWFTfGW9XjX | Young, casual American male |
| Arnold | VR6AewLTigWG4xSOukaG | Crisp, professional American male |
| Domi | AZnzlk1XvdvUeBnXmlld | Strong, confident American female |

## Setup in Twilio

1. **Update your Twilio webhook URL:**
   ```
   https://cora-backend-epv0.onrender.com/api/twilio-elevenlabs/voice
   ```

2. **Configure the webhook:**
   - Method: HTTP POST
   - Request URL: The URL above
   - Fallback URL: (optional) `/api/twilio-static/voice` for backup

## Voice Settings

The integration uses optimized settings for real estate conversations:

```python
"voice_settings": {
    "stability": 0.5,           # Balance between consistency and expressiveness
    "similarity_boost": 0.75,    # High voice accuracy
    "style": 0.5,               # Natural style without exaggeration
    "use_speaker_boost": True   # Enhanced clarity
}
```

## Cost Comparison

| Service | Cost per minute | Quality | Control |
|---------|----------------|---------|---------|
| Synthflow | $0.12 | Good | Limited |
| Twilio (basic) | $0.02 | Robotic | Full |
| **Twilio + ElevenLabs** | **$0.03** | **Excellent** | **Full** |

ElevenLabs adds only $0.01/minute to the base Twilio cost while providing:
- Natural, human-like voices
- Better customer experience
- Professional sound quality
- Multiple voice options

## Testing the Integration

### Test locally:
```bash
python3 test_elevenlabs.py
```

### Test the endpoint:
```bash
curl https://cora-backend-epv0.onrender.com/api/twilio-elevenlabs/test
```

### Test specific voices:
```bash
curl https://cora-backend-epv0.onrender.com/api/twilio-elevenlabs/test-voice/rachel
curl https://cora-backend-epv0.onrender.com/api/twilio-elevenlabs/test-voice/bella
```

## How It Works

1. **Incoming Call**: Twilio receives call and sends to our webhook
2. **Generate Welcome**: ElevenLabs generates natural welcome message
3. **Listen for Speech**: Twilio captures caller's speech
4. **Process & Respond**: 
   - We analyze what they said
   - Generate contextual response
   - ElevenLabs converts to natural speech
   - Twilio plays the audio to caller
5. **Fallback**: If ElevenLabs fails, use Twilio's voice

## Enhanced Responses

The new system provides more conversational, engaging responses:

### Before (Twilio voice):
> "123 Main Street is a 3 bedroom home for 489 thousand dollars."

### After (ElevenLabs):
> "Oh, you're interested in 123 Main Street! That's one of my favorites. It's a stunning 3-bedroom home with beautiful hardwood floors and granite countertops. At 489 thousand, it's perfectly priced for the downtown Austin market. Would you like to schedule a private showing this week?"

## Troubleshooting

### If voices don't work:
1. Check ElevenLabs API key in `.env`
2. Verify the endpoint is deployed
3. Check Twilio webhook configuration
4. Look at logs for errors

### Common Issues:
- **"Technical difficulties"**: Usually means form parsing error
- **Robotic voice**: ElevenLabs failed, using Twilio fallback
- **No response**: Check webhook URL in Twilio console

## Next Steps

To further improve the voice experience:
1. Add voice selection per agent/campaign
2. Implement voice cloning for branded experience
3. Add emotion/tone adjustment based on context
4. Create voice profiles for different scenarios