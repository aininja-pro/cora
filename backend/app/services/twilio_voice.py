"""
Twilio Voice Service - Our own voice system (no Synthflow needed!)
Cost: ~$0.03/minute total vs Synthflow's $0.12/minute
"""

import os
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Gather
import asyncio
from supabase import create_client

logger = logging.getLogger(__name__)

class TwilioVoiceService:
    """Handle voice calls directly with Twilio"""
    
    def __init__(self):
        # Twilio credentials (you'll need to sign up at twilio.com)
        # Support both naming conventions
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID") or os.getenv("TWILIO_SID", "")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN") or os.getenv("TWILIO_TOKEN", "")
        self.phone_number = os.getenv("TWILIO_PHONE_NUMBER", "")
        
        # Initialize Twilio client only if credentials exist
        if self.account_sid and self.auth_token:
            self.client = Client(self.account_sid, self.auth_token)
        else:
            logger.warning("Twilio credentials not configured")
            self.client = None
        
        # Supabase for database
        self.supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY")
        )
        
        # Store active calls
        self.active_calls = {}
    
    def handle_incoming_call(self, form_data: Dict[str, Any]) -> str:
        """
        Handle incoming call from Twilio
        Returns TwiML response (XML that tells Twilio what to do)
        """
        # Extract call information - ALL REAL DATA!
        call_sid = form_data.get('CallSid', '')  # Unique call ID
        from_number = form_data.get('From', '')  # Caller's actual phone number
        to_number = form_data.get('To', '')  # Your Twilio number they called
        caller_city = form_data.get('FromCity', '')
        caller_state = form_data.get('FromState', '')
        caller_zip = form_data.get('FromZip', '')
        caller_country = form_data.get('FromCountry', '')
        
        # Store call info
        self.active_calls[call_sid] = {
            'call_id': call_sid,
            'phone_number': from_number,
            'to_number': to_number,
            'location': f"{caller_city}, {caller_state} {caller_zip}",
            'country': caller_country,
            'started_at': datetime.now().isoformat(),
            'transcript': []
        }
        
        # Log the call
        logger.info(f"""
        📞 INCOMING CALL:
        Call ID: {call_sid}
        From: {from_number}
        Location: {caller_city}, {caller_state}
        """)
        
        # Save initial call record to database
        try:
            self.supabase.table('calls').insert({
                'call_id': call_sid,
                'phone_number': from_number,
                'status': 'in_progress',
                'started_at': datetime.now().isoformat()
            }).execute()
        except Exception as e:
            logger.error(f"Error saving call to database: {e}")
        
        # Create TwiML response (this is what Twilio will execute)
        response = VoiceResponse()
        
        # Greet the caller with a natural voice
        response.say(
            "Hi! This is Cora from your real estate team. "
            "I can help you with property information, schedule showings, "
            "or answer any questions. How can I assist you today?",
            voice='Polly.Joanna',  # Natural female voice
            language='en-US'
        )
        
        # Start listening for their response
        self._add_speech_gather(response)
        
        return str(response)
    
    async def process_speech(self, form_data: Dict[str, Any]) -> str:
        """
        Process speech from the caller
        This is called when Twilio captures what the caller said
        """
        call_sid = form_data.get('CallSid', '')
        speech_result = form_data.get('SpeechResult', '')
        confidence = form_data.get('Confidence', '0')
        
        logger.info(f"""
        🎤 CALLER SAID: "{speech_result}"
        Confidence: {float(confidence) * 100:.1f}%
        Call ID: {call_sid}
        """)
        
        # Get call data
        call_data = self.active_calls.get(call_sid, {})
        
        # Add to transcript
        call_data['transcript'].append({
            'speaker': 'caller',
            'text': speech_result,
            'timestamp': datetime.now().isoformat(),
            'confidence': float(confidence)
        })
        
        # Generate AI response using GPT-4
        ai_response = await self._generate_response(speech_result, call_data)
        
        # Add AI response to transcript
        call_data['transcript'].append({
            'speaker': 'cora',
            'text': ai_response,
            'timestamp': datetime.now().isoformat()
        })
        
        # Update database with transcript
        try:
            self.supabase.table('calls').update({
                'transcript': json.dumps(call_data['transcript']),
                'last_updated': datetime.now().isoformat()
            }).eq('call_id', call_sid).execute()
        except Exception as e:
            logger.error(f"Error updating call transcript: {e}")
        
        # Create response
        response = VoiceResponse()
        
        # Speak the AI response
        response.say(
            ai_response,
            voice='Polly.Joanna',
            language='en-US'
        )
        
        # Continue listening
        self._add_speech_gather(response)
        
        return str(response)
    
    def end_call(self, form_data: Dict[str, Any]) -> Dict:
        """
        Handle call completion
        This is called when the call ends
        """
        call_sid = form_data.get('CallSid', '')
        call_status = form_data.get('CallStatus', '')
        duration = form_data.get('CallDuration', '0')
        recording_url = form_data.get('RecordingUrl', '')
        
        logger.info(f"""
        📴 CALL ENDED:
        Call ID: {call_sid}
        Duration: {duration} seconds
        Status: {call_status}
        """)
        
        # Get call data
        call_data = self.active_calls.get(call_sid, {})
        
        # Update database with final info
        try:
            self.supabase.table('calls').update({
                'status': 'completed',
                'duration': int(duration),
                'recording_url': recording_url,
                'ended_at': datetime.now().isoformat(),
                'final_transcript': json.dumps(call_data.get('transcript', []))
            }).eq('call_id', call_sid).execute()
        except Exception as e:
            logger.error(f"Error updating call end: {e}")
        
        # Clean up
        if call_sid in self.active_calls:
            del self.active_calls[call_sid]
        
        return {
            'success': True,
            'call_id': call_sid,
            'duration': duration
        }
    
    def _add_speech_gather(self, response: VoiceResponse):
        """
        Add speech gathering to TwiML response
        This tells Twilio to listen for speech
        """
        gather = Gather(
            input='speech',  # Listen for speech (not DTMF tones)
            action='/api/twilio/process-speech',  # Where to send the result
            method='POST',
            speechTimeout='auto',  # Auto-detect when caller stops talking
            language='en-US',
            hints='property, house, showing, schedule, appointment, address'  # Help recognition
        )
        response.append(gather)
        
        # If no input, ask again
        response.say(
            "I didn't catch that. Could you please repeat?",
            voice='Polly.Joanna'
        )
        response.redirect('/api/twilio/incoming-call')
    
    async def _generate_response(self, user_message: str, call_data: Dict) -> str:
        """
        Generate AI response using GPT-4
        """
        import openai
        import re
        
        # Initialize OpenAI client
        openai_client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Extract property reference if mentioned
        property_info = None
        message_lower = user_message.lower()
        
        # Look for property addresses
        property_data = {}
        if '123 main' in message_lower:
            property_data = {
                "address": "123 Main Street, Austin, TX 78701",
                "price": "$489,000",
                "bedrooms": 3,
                "bathrooms": 2.5,
                "sqft": 2200,
                "features": "Modern kitchen with granite countertops, hardwood floors, spacious fenced backyard with custom patio"
            }
        elif '456 oak' in message_lower:
            property_data = {
                "address": "456 Oak Avenue, Austin, TX 78704",
                "price": "$325,000",
                "bedrooms": 2,
                "bathrooms": 2,
                "sqft": 1500,
                "features": "Recently renovated condo, stainless steel appliances, rooftop access"
            }
        elif '789 pine' in message_lower:
            property_data = {
                "address": "789 Pine Lane, Austin, TX 78703",
                "price": "$750,000",
                "bedrooms": 4,
                "bathrooms": 3,
                "sqft": 3500,
                "features": "Luxury home with pool, smart home features, three-car garage"
            }
        
        # Build system prompt
        system_prompt = """You are Cora, a warm and professional AI real estate assistant handling phone calls.
        Keep responses conversational and concise (2-3 sentences max) since this is a phone call.
        Be helpful, friendly, and proactive in offering assistance like scheduling showings or sending information.
        
        Important guidelines:
        - Speak naturally as if on a phone call
        - Keep responses brief and to the point
        - Ask clarifying questions when needed
        - Offer to schedule showings when appropriate
        - Be enthusiastic about properties"""
        
        if property_data:
            system_prompt += f"\n\nProperty Details:\n{json.dumps(property_data, indent=2)}"
        
        # Get conversation history
        transcript = call_data.get('transcript', [])
        
        # Build messages for GPT-4
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add recent conversation history (last 5 exchanges)
        for entry in transcript[-10:]:
            role = "assistant" if entry['speaker'] == 'cora' else "user"
            messages.append({"role": role, "content": entry['text']})
        
        # Add current message
        messages.append({"role": "user", "content": user_message})
        
        try:
            # Call GPT-4
            response = await openai_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                max_tokens=150,
                temperature=0.7
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Error calling GPT-4: {e}")
            # Fallback to simple response
            if property_data:
                return f"I'd be happy to tell you about {property_data['address']}. It's a {property_data['bedrooms']} bedroom home priced at {property_data['price']}. Would you like to schedule a showing?"
            else:
                return "I can help you find the perfect property. What are you looking for?"
    
    def make_outbound_call(self, to_number: str, message: str) -> Dict:
        """
        Make an outbound call
        """
        if not self.client:
            return {'error': 'Twilio not configured'}
        
        try:
            call = self.client.calls.create(
                twiml=f'<Response><Say voice="Polly.Joanna">{message}</Say></Response>',
                to=to_number,
                from_=self.phone_number
            )
            
            return {
                'success': True,
                'call_sid': call.sid,
                'status': call.status
            }
        except Exception as e:
            logger.error(f"Error making outbound call: {e}")
            return {'error': str(e)}
    
    def get_phone_number_info(self, phone_number: str) -> Dict:
        """
        Look up information about a phone number
        """
        if not self.client:
            return {}
        
        try:
            number = self.client.lookups.v1.phone_numbers(phone_number).fetch(
                type=['carrier', 'caller-name']
            )
            
            return {
                'formatted': number.national_format,
                'carrier': number.carrier.get('name', 'Unknown'),
                'type': number.carrier.get('type', 'Unknown'),
                'caller_name': number.caller_name.get('caller_name', 'Unknown')
            }
        except:
            return {}