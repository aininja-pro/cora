from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import httpx
import io
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

class TextToSpeechRequest(BaseModel):
    text: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel voice (default)

@router.post("/text-to-speech")
async def text_to_speech(request: TextToSpeechRequest):
    """
    Convert text to speech using ElevenLabs API.
    Returns audio stream that can be played in the browser.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key or api_key.startswith("<"):
        # Fallback to browser's speech synthesis instruction
        return {
            "success": False,
            "message": "ElevenLabs not configured. Use browser speech synthesis.",
            "fallback": True
        }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{request.voice_id}",
                headers={
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": api_key
                },
                json={
                    "text": request.text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75
                    }
                }
            )
            
            if response.status_code == 200:
                # Return audio stream
                return StreamingResponse(
                    io.BytesIO(response.content),
                    media_type="audio/mpeg",
                    headers={
                        "Content-Disposition": "inline; filename=speech.mp3"
                    }
                )
            else:
                logger.error(f"ElevenLabs API error: {response.status_code}")
                return {
                    "success": False,
                    "message": "Error generating speech",
                    "fallback": True
                }
                
    except Exception as e:
        logger.error(f"Error in text-to-speech: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "fallback": True
        }

@router.get("/voices")
async def get_available_voices():
    """Get list of available ElevenLabs voices."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key or api_key.startswith("<"):
        return {
            "success": False,
            "voices": [],
            "message": "ElevenLabs not configured"
        }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": api_key}
            )
            
            if response.status_code == 200:
                data = response.json()
                voices = [
                    {
                        "voice_id": voice["voice_id"],
                        "name": voice["name"],
                        "preview_url": voice.get("preview_url")
                    }
                    for voice in data.get("voices", [])
                ]
                return {
                    "success": True,
                    "voices": voices
                }
            else:
                return {
                    "success": False,
                    "voices": [],
                    "message": "Error fetching voices"
                }
                
    except Exception as e:
        logger.error(f"Error fetching voices: {str(e)}")
        return {
            "success": False,
            "voices": [],
            "message": str(e)
        }