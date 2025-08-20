# CORA Environment Setup

## Required Environment Variables

Create a `.env` file in the `server/` directory with these variables:

```bash
# OpenAI API
OPENAI_API_KEY=sk-...

# Twilio (for PSTN calls)
TWILIO_AUTH_TOKEN=your-twilio-auth-token
PUBLIC_URL=https://your-ngrok-url.ngrok-free.app

# JWT Secret for tool tokens
JWT_SECRET=your-secure-jwt-secret-change-in-production

# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# Optional
AGENT_NAME=CORA
PORT=3000
```

## Quick Start Commands

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Development with auto-reload:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

4. **Setup ngrok for Twilio webhooks:**
   ```bash
   # Install ngrok if not already installed
   npm install -g ngrok
   
   # Run ngrok in separate terminal
   ngrok http 3000
   
   # Update PUBLIC_URL in .env with your ngrok URL
   ```

## Test WebRTC Demo (Browser)

1. Start server: `npm run dev`
2. Open browser: `http://localhost:3000`
3. Click "Connect" to start WebRTC session
4. Speak to test the voice pipeline

## Test PSTN Call (Twilio)

1. Configure Twilio webhook URL: `https://your-ngrok-url.ngrok-free.app/twilio/voice`
2. Call your Twilio number
3. Should connect to CORA voice assistant

## Key Acceptance Tests

✅ **Tone Test:** 1 kHz sine wave survives 16k→8k→μ-law conversion without artifacts
✅ **Transcription:** Speaking 2-3 seconds yields `input_audio_transcription.completed`
✅ **No Under-commit:** No "buffer has 96ms" errors during speech
✅ **Barge-in:** Speaking over CORA halts output within 150ms
✅ **Tool Flow:** Model calls tool → server returns envelope → assistant continues
✅ **Twilio Marks:** Sent marks echo back after real audio playback

## Architecture Notes

- **WebRTC Path:** Browser → OpenAI Realtime (ephemeral token) → Tool calls via JWT to `/api/tools/execute`
- **PSTN Path:** Caller → Twilio → WSS to `/media-stream` → OpenAI Realtime → Tool execution server-side
- **Audio Pipeline:** μ-law 8kHz ↔ PCM16 16kHz with band-limited resampling
- **Half-duplex:** Pauses input processing while assistant speaks to prevent feedback