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
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
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
    
    def process_speech(self, form_data: Dict[str, Any]) -> str:
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
        
        # Generate AI response (we'll enhance this next)
        ai_response = self._generate_response(speech_result, call_data)
        
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
    
    def _generate_response(self, user_message: str, call_data: Dict) -> str:
        """
        Generate AI response based on what the caller said
        For now, this is a simple response - we'll add GPT-4 next
        """
        message_lower = user_message.lower()
        
        # Check for property mentions
        if '123 main' in message_lower:
            return (
                "Yes! 123 Main Street is a beautiful 3 bedroom, 2 and a half bath home "
                "in downtown Austin. It's priced at 489 thousand dollars and features "
                "granite countertops and hardwood floors. Would you like to schedule a showing?"
            )
        elif '456 oak' in message_lower:
            return (
                "456 Oak Avenue is a charming 2 bedroom, 2 bath condo priced at "
                "325 thousand dollars. It's perfect for first-time buyers. "
                "Would you like more details or shall we set up a viewing?"
            )
        elif 'schedule' in message_lower or 'showing' in message_lower:
            return (
                "I'd be happy to schedule a showing for you. We have availability "
                "tomorrow at 2 PM or Thursday at 10 AM. Which works better for you?"
            )
        elif 'thank' in message_lower or 'bye' in message_lower:
            return (
                "You're welcome! Feel free to call anytime if you have more questions. "
                "Have a great day!"
            )
        else:
            return (
                "I can help you with information about our available properties, "
                "scheduling showings, or answering questions about the buying process. "
                "What would you like to know?"
            )
    
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