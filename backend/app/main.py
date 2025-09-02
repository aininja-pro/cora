from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# Only load .env in development
if os.getenv("APP_ENV") != "production":
    from dotenv import load_dotenv
    load_dotenv()

from .routes import synthflow, agent, voice, synthflow_action, synthflow_simple, synthflow_debug, synthflow_catch_all, synthflow_properties, twilio, twilio_simple, twilio_working, twilio_basic, twilio_static, twilio_elevenlabs, twilio_polly, twilio_polly_simple, twilio_conversation_relay, calls_api, properties_api, voice_integration, notifications, twilio_inbound
from .routes import twilio_conversation_relay_enhanced

app = FastAPI(
    title="CORA API",
    description="AI Voice Assistant for Real Estate Agents with ElevenLabs",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.1.81:5173", "https://api.synthflow.ai", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(synthflow.router)
app.include_router(synthflow_action.router)
app.include_router(synthflow_simple.router)
app.include_router(synthflow_debug.router)
app.include_router(synthflow_catch_all.router)
app.include_router(synthflow_properties.router)
app.include_router(agent.router)
app.include_router(voice.router)
app.include_router(twilio.router)  # Our new Twilio routes!
app.include_router(twilio_simple.router)  # Simple test route
app.include_router(twilio_working.router)  # Working version with speech
app.include_router(twilio_basic.router)  # Most basic version
app.include_router(twilio_static.router)  # Static response - guaranteed to work!
app.include_router(twilio_elevenlabs.router)  # ElevenLabs high-quality voice
app.include_router(twilio_polly.router)  # Amazon Polly voices via Twilio
app.include_router(twilio_polly_simple.router)  # Simple Polly without form parsing
app.include_router(twilio_conversation_relay.router)  # Original ConversationRelay with ElevenLabs
app.include_router(twilio_conversation_relay_enhanced.router, prefix="/api/twilio-relay-v2")  # Enhanced version on different path
app.include_router(calls_api.router)  # API for retrieving call data
app.include_router(properties_api.router)  # API for managing properties
app.include_router(voice_integration.router)  # Voice integration endpoints
app.include_router(notifications.router)  # SMS notifications
app.include_router(twilio_inbound.router)  # Inbound SMS webhooks

@app.get("/")
async def root():
    return {"message": "Welcome to CORA API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}