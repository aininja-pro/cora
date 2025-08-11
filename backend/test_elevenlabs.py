"""
Test ElevenLabs integration locally
"""

import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

async def test_elevenlabs():
    """Test ElevenLabs API directly"""
    
    if not ELEVENLABS_API_KEY:
        print("❌ ElevenLabs API key not found in .env")
        return
    
    print(f"✅ ElevenLabs API key found: {ELEVENLABS_API_KEY[:10]}...")
    
    text = "Hello! This is a test of the ElevenLabs voice synthesis. I'm Cora, your real estate assistant."
    
    try:
        async with httpx.AsyncClient() as client:
            print("📡 Sending request to ElevenLabs...")
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{RACHEL_VOICE_ID}",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "text": text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.5,
                        "use_speaker_boost": True
                    }
                },
                timeout=10.0
            )
            
            print(f"📨 Response status: {response.status_code}")
            
            if response.status_code == 200:
                # Save audio to file
                with open("test_audio.mp3", "wb") as f:
                    f.write(response.content)
                print("✅ Audio generated successfully! Saved as test_audio.mp3")
                print(f"📏 Audio size: {len(response.content):,} bytes")
            else:
                print(f"❌ Error: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"❌ Exception: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_elevenlabs())