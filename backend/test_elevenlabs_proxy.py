"""
Test ElevenLabs with IPRoyal proxy
"""

import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

# IPRoyal proxy credentials
PROXY_USERNAME = "gqiRgyEwsiCzU4l7"
PROXY_PASSWORD = "8dUWWz3VNEf3gGMp"
PROXY_HOST = "geo.iproyal.com"
PROXY_PORT = "12321"

async def test_elevenlabs_with_proxy():
    """Test ElevenLabs API through IPRoyal proxy"""
    
    if not ELEVENLABS_API_KEY:
        print("❌ ElevenLabs API key not found in .env")
        return
    
    print(f"✅ ElevenLabs API key found: {ELEVENLABS_API_KEY[:10]}...")
    
    # Configure proxy
    proxy_auth = f"{PROXY_USERNAME}:{PROXY_PASSWORD}"
    proxy_url = f"http://{proxy_auth}@{PROXY_HOST}:{PROXY_PORT}"
    print(f"🔐 Using IPRoyal proxy: {PROXY_HOST}:{PROXY_PORT}")
    
    text = "Hello! This is a test of ElevenLabs through IPRoyal proxy. The voice quality should be excellent now!"
    
    try:
        # httpx uses 'proxy' parameter, not 'proxies'
        async with httpx.AsyncClient(proxy=proxy_url) as client:
            # First, test the proxy connection
            print("🌐 Testing proxy connection...")
            test_response = await client.get("https://ipv4.icanhazip.com", timeout=10.0)
            proxy_ip = test_response.text.strip()
            print(f"✅ Proxy working! External IP: {proxy_ip}")
            
            # Now test ElevenLabs
            print("📡 Sending request to ElevenLabs through proxy...")
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{RACHEL_VOICE_ID}/stream",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "User-Agent": "CORA-RealEstate-Assistant/1.0",
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
                timeout=15.0
            )
            
            print(f"📨 Response status: {response.status_code}")
            
            if response.status_code == 200:
                # Save audio to file
                with open("test_audio_proxy.mp3", "wb") as f:
                    f.write(response.content)
                print("✅ Audio generated successfully through proxy! Saved as test_audio_proxy.mp3")
                print(f"📏 Audio size: {len(response.content):,} bytes")
            else:
                print(f"❌ Error: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"❌ Exception: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_elevenlabs_with_proxy())