"""
Test IPRoyal proxy connection
"""

import requests
from urllib.parse import quote

# IPRoyal proxy credentials
username = 'gqiRgyEwsiCzU4l7'
password = '8dUWWz3VNEf3gGMp'
proxy_host = 'geo.iproyal.com'
proxy_port = '12321'

# URL encode credentials in case of special characters
encoded_username = quote(username)
encoded_password = quote(password)

proxies = {
    'http': f'http://{encoded_username}:{encoded_password}@{proxy_host}:{proxy_port}',
    'https': f'http://{encoded_username}:{encoded_password}@{proxy_host}:{proxy_port}'
}

print("🔐 Testing IPRoyal proxy...")

try:
    # Test proxy connection
    response = requests.get('https://ipv4.icanhazip.com', proxies=proxies, timeout=10)
    proxy_ip = response.text.strip()
    print(f"✅ Proxy working! External IP: {proxy_ip}")
    
    # Now test ElevenLabs
    print("\n📡 Testing ElevenLabs through proxy...")
    
    ELEVENLABS_API_KEY = "sk_121356053c52b2c5732b979276d72d07676fb49b786b7b38"
    RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
    
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    
    data = {
        "text": "Hello! Testing ElevenLabs through IPRoyal proxy.",
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    
    response = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{RACHEL_VOICE_ID}",
        headers=headers,
        json=data,
        proxies=proxies,
        timeout=15
    )
    
    print(f"📨 ElevenLabs response: {response.status_code}")
    
    if response.status_code == 200:
        with open("test_proxy_audio.mp3", "wb") as f:
            f.write(response.content)
        print(f"✅ Success! Audio saved ({len(response.content):,} bytes)")
    else:
        print(f"❌ Error: {response.text}")
        
except Exception as e:
    print(f"❌ Error: {str(e)}")