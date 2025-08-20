/**
 * WebSocket Media Bridge - Twilio <-> OpenAI Realtime
 * Handles bidirectional audio streaming with μ-law/PCM16 conversion
 */
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import crypto from 'crypto';
import { getTenantByToNumber, renderGreeting } from '../lib/tenancy';
import { SYSTEM_PROMPT } from '../ai/systemPrompt';
import { decodeMuLaw, encodeMuLaw, resample8kTo16k, resample16kTo8k, resample8kTo24k, resample24kTo8k } from '../lib/audio';
import { sendAudioToRealtime, commitAudioBuffer } from '../ai/realtime';
import { handleRealtimeEvent } from '../ai/realtimeHandlers';
import { ToolContext } from '../ai/tools';
import { startCallMetrics, recordFirstAudio, recordToolExecution, finishCallMetrics } from '../lib/metrics';
import { db } from '../lib/database';

interface CallSession {
  callSid: string;
  streamSid: string; // Add Twilio streamSid for proper media frames
  toNumber: string;
  tenant: any;
  twilioWs: WebSocket;
  realtimeWs: WebSocket | null;
  audioBuffer: Buffer[];
  lastCommit: number;
  isConnected: boolean;
  hasBargein: boolean;
  dbCallId?: string;
  callerNumber?: string;
  bytesSinceCommit: number; // Track bytes for proper commit gating
  outgoingQueue: Buffer[]; // Queue for 160-byte μ-law frames
  outputTimer?: NodeJS.Timeout; // 20ms timer for paced audio output
  isAssistantSpeaking: boolean; // Half-duplex flag to prevent feedback
}

const activeCalls = new Map<string, CallSession>();

/**
 * Handle new Twilio media stream WebSocket connection
 */
export function handleMediaStream(ws: WebSocket, req: IncomingMessage): void {
  console.log('🔗 WebSocket connection received from:', req.headers.origin);
  console.log('🔗 URL:', req.url);
  
  // For now, we'll get the callSid and toNumber from Twilio's start event
  // instead of requiring them in the URL parameters
  let callSid = '';
  let toNumber = '';
  
  // We'll extract these from the first Twilio message
  
  console.log(`🔗 Media stream connected - waiting for start event`);
  
  // Handle Twilio WebSocket events
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(Buffer.from(data as any).toString());
      
      // Handle the start event to get callSid and other details
      if (message.event === 'start') {
        console.log('📋 Raw start message:', JSON.stringify(message, null, 2));
        callSid = message.start?.callSid || message.callSid;
        const streamSid = message.streamSid || message.start?.streamSid;
        const from = message.start?.customParameters?.from || 'unknown';
        const to = message.start?.customParameters?.to || message.start?.to;
        
        console.log(`🔗 Media stream started for call ${callSid}`);
        console.log(`   Stream SID: ${streamSid}`);
        console.log(`   From: ${from} → To: ${to}`);
        
        // Extract toNumber for tenant lookup
        toNumber = to;
        const tenant = getTenantByToNumber(toNumber);
        
        // Now initialize the session
        const session: CallSession = {
          callSid,
          streamSid,
          toNumber,
          tenant,
          twilioWs: ws,
          realtimeWs: null,
          audioBuffer: [],
          lastCommit: Date.now(),
          isConnected: false,
          hasBargein: false,
          bytesSinceCommit: 0, // Not used with server_vad but keeping for debugging
          outgoingQueue: [],
          outputTimer: undefined,
          isAssistantSpeaking: false
        };
        
        activeCalls.set(callSid, session);
        startCallMetrics(callSid);
        
        // Initialize OpenAI Realtime connection
        initializeRealtimeConnection(session);
        
        // Initialize database tracking
        initializeCallDatabase(session, message);
      } else if (callSid) {
        // Handle other events only if we have a session
        const existingSession = activeCalls.get(callSid);
        if (existingSession) {
          handleTwilioMessage(existingSession, data);
        }
      }
    } catch (error) {
      console.error('❌ Error parsing Twilio message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`📴 Media stream closed for call ${callSid}`);
    cleanupCall(callSid);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Media stream error for call ${callSid}:`, error);
    cleanupCall(callSid);
  });
}

/**
 * Initialize OpenAI Realtime WebSocket connection
 */
async function initializeRealtimeConnection(session: CallSession): Promise<void> {
  try {
    // Build system prompt with tenant-specific greeting
    const greeting = renderGreeting(session.tenant);
    const instructions = SYSTEM_PROMPT(session.tenant.brandName, session.tenant.agentDisplayName) + `
Start with this exact greeting, then wait for the caller:
"${greeting}"
`;
    
    // Create WebSocket connection to OpenAI Realtime API
    const realtimeWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
    
    session.realtimeWs = realtimeWs;
    
    realtimeWs.on('open', () => {
      console.log(`🤖 Realtime connected for call ${session.callSid}`);
      
      // Fix #1: Lock session config to 16kHz input/output (CRITICAL: prevents 24k→8k artifacts)
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          voice: session.tenant.voice || 'verse',
          instructions: instructions,
          turn_detection: {
            type: 'server_vad',
            silence_duration_ms: 300,
            prefix_padding_ms: 300
          },
          input_audio_format: "pcm16",
          output_audio_format: "g711_ulaw",
          input_audio_transcription: {
            model: 'whisper-1'
          },
          tools: require('../ai/tools').TOOLS,
          tool_choice: 'auto'
        }
      };
      
      // CRITICAL: Log exact session config (ChatGPT verification item #6)
      console.log('📡 SESSION PINNING:', JSON.stringify(sessionConfig, null, 2));
      console.log(`✅ LOCKED: input=pcm16 (reliable ASR), output=g711_ulaw (direct Twilio)`);
      realtimeWs.send(JSON.stringify(sessionConfig));
      
      session.isConnected = false; // Wait for session.updated confirmation
      
      // Send explicit greeting to test output (ChatGPT's diagnostic)
      console.log('🎤 Triggering explicit greeting...');
      realtimeWs.send(JSON.stringify({
        type: 'response.create',
        response: {
          instructions: 'Introduce yourself as CORA and ask how you can help.'
        }
      }));
    });
    
    realtimeWs.on('message', (data) => {
      handleRealtimeMessage(session, Buffer.from(data as any));
    });
    
    realtimeWs.on('close', () => {
      console.log(`🔌 Realtime disconnected for call ${session.callSid}`);
      // TODO: Implement reconnection logic from Master Plan
    });
    
    realtimeWs.on('error', (error) => {
      console.error(`❌ Realtime error for call ${session.callSid}:`, error);
      // TODO: Implement fallback to human transfer
    });
    
  } catch (error) {
    console.error(`❌ Failed to initialize Realtime for call ${session.callSid}:`, error);
  }
}

/**
 * Handle messages from Twilio WebSocket
 */
async function handleTwilioMessage(session: CallSession, data: any): Promise<void> {
  try {
    const message = JSON.parse(Buffer.from(data).toString());
    
    switch (message.event) {
      case 'connected':
        console.log(`📞 Twilio connected for call ${session.callSid}`);
        break;
        
      case 'start':
        console.log(`🎬 Call started: ${session.callSid}`);
        await initializeCallDatabase(session, message);
        break;
        
      case 'media':
        handleIncomingAudio(session, message);
        break;
        
      case 'stop':
        console.log(`🛑 Call stopped: ${session.callSid}`);
        cleanupCall(session.callSid);
        break;
        
      case 'mark':
        // ChatGPT spec: Confirm Twilio echoes mark when audio plays
        console.log(`📍 Mark confirmed: ${message.mark?.name} - audio reached playback`);
        break;
    }
  } catch (error) {
    console.error(`❌ Error parsing Twilio message:`, error);
  }
}

/**
 * Handle incoming audio from Twilio (μ-law 8kHz -> PCM16 16kHz)
 */
function handleIncomingAudio(session: CallSession, message: any): void {
  if (!session.realtimeWs || !session.isConnected) return;
  
  // Half-duplex gating: don't process input while assistant is speaking (prevent feedback)
  if (session.isAssistantSpeaking) {
    console.log('🔇 Skipping input while CORA is speaking (half-duplex)');
    return;
  }
  
  try {
    // CRITICAL: μ-law → PCM16 8k → band-limited upsample to 24k (ChatGPT's exact fix)
    const mulawData = Buffer.from(message.media.payload, 'base64');
    
    // Log frame info for debugging
    if (session.bytesSinceCommit === 0) {
      console.log(`📏 μ-law frame: ${mulawData.length} bytes, first8: ${mulawData.subarray(0, 8).toString('hex')}`);
    }
    
    // Decode μ-law to PCM16 8kHz
    const pcm8k = decodeMuLaw(mulawData);
    
    // Band-limited upsample 8k → 24k (OpenAI PCM16 default is 24kHz)
    const pcm24k = resample8kTo24k(pcm8k);
    
    // AGC to make caller audible (target -18dBFS)
    const int16Array = new Int16Array(pcm24k.length / 2);
    for (let i = 0; i < int16Array.length; i++) {
      int16Array[i] = pcm24k.readInt16LE(i * 2);
    }
    
    const samples = Array.from(int16Array);
    const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
    
    const targetRms = 3500;
    const maxGain = 12; // ChatGPT spec: cap at +12dB
    const gainFactor = rms > 100 ? Math.min(maxGain, targetRms / rms) : 1;
    
    if (gainFactor > 1.1) {
      console.log(`🔊 AGC: RMS ${Math.round(rms)} → boost ${gainFactor.toFixed(1)}x (peak was ${peak})`);
      for (let i = 0; i < int16Array.length; i++) {
        const boosted = Math.max(-32768, Math.min(32767, Math.round(int16Array[i] * gainFactor)));
        int16Array[i] = boosted;
      }
      const newPeak = Math.round(peak * gainFactor);
      const newRms = Math.round(rms * gainFactor);
      console.log(`🎚️ Post-AGC: RMS ${newRms}, peak ${newPeak} ${newPeak > 3000 ? '✅' : '⚠️ still quiet'}`);
    }
    
    // Create buffer from Int16Array's underlying memory (post-AGC)
    const finalBuffer = Buffer.from(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    
    // CRITICAL: Verify we're sending PCM16 bytes (not μ-law) - ChatGPT requirement
    if (session.bytesSinceCommit === 0) {
      const first16Bytes = finalBuffer.subarray(0, 16).toString('hex');
      console.log(`🔍 PCM16 first 16 bytes: ${first16Bytes} (should be little-endian pairs, not μ-law clusters)`);
      console.log(`📏 PCM16 buffer: ${finalBuffer.length} bytes (${finalBuffer.length / 2} samples)`);
    }
    
    const audioBase64 = finalBuffer.toString('base64');
    
    // CRITICAL: Wait for session.updated confirmation before sending
    if (!session.isConnected) {
      console.log(`⚠️ Session not confirmed as PCM16 yet - buffering audio`);
      return;
    }
    
    // CRITICAL: Add MD5 verification (ChatGPT step 4)
    const crypto = require('crypto');
    const bufferMD5 = crypto.createHash('md5').update(finalBuffer).digest('hex');
    const base64First32 = audioBase64.substring(0, 32);
    console.log(`🔒 PCM16 MD5: ${bufferMD5}, base64[0:32]: ${base64First32}`);
    
    // Send processed PCM16 to OpenAI
    sendAudioToRealtime(session.realtimeWs, audioBase64);
    
    // CRITICAL: Let server_vad handle commits (no manual commits)
    console.log(`📡 Sent ${finalBuffer.length} bytes PCM16 - letting server_vad commit automatically`);
    session.lastCommit = Date.now(); // Track for transcription timing
    
  } catch (error) {
    console.error(`❌ Error processing incoming audio:`, error);
  }
}

/**
 * Handle messages from OpenAI Realtime WebSocket
 */
async function handleRealtimeMessage(session: CallSession, data: Buffer): Promise<void> {
  try {
    const message = JSON.parse(data.toString());
    
    // 🔍 DEBUG: Log ALL events to debug transcription issue
    console.log(`🤖 OpenAI Event: ${message.type}${message.transcript ? ` | transcript: "${message.transcript}"` : ''}${message.item_id ? ` | item_id: ${message.item_id}` : ''}`);
    
    // Create send function for the handler
    const send = (payload: any) => {
      if (session.realtimeWs && session.isConnected) {
        session.realtimeWs.send(JSON.stringify(payload));
      }
    };
    
    // Create tool context
    const ctx: ToolContext = {
      tenantId: session.tenant?.agentDisplayName || 'default'
    };
    
    // Use the new handler for tool-related events
    await handleRealtimeEvent(message, send, ctx);
    
    // Handle other events
    switch (message.type) {
      case 'session.created':
        console.log(`✅ Realtime session created for call ${session.callSid}`);
        break;
        
      case 'session.updated':
        console.log(`🔄 Session updated - full response:`, JSON.stringify(message.session, null, 2));
        if (message.session?.input_audio_format === 'pcm16' && message.session?.output_audio_format === 'g711_ulaw') {
          console.log(`✅ SESSION CONFIRMED: input=pcm16, output=g711_ulaw - ready for audio`);
          console.log(`🎯 Server_vad: ${JSON.stringify(message.session.turn_detection)}`);
          session.isConnected = true; // Now confirmed as PCM16
        } else {
          console.log(`❌ SESSION MISMATCH: input=${message.session?.input_audio_format}, output=${message.session?.output_audio_format}`);
        }
        break;
        
      case 'response.audio.delta':
        console.log(`🔊 CORA speaking: ${message.delta ? 'audio data' : 'no data'}`);
        // Fix #5: Half-duplex gating - start blocking input on first audio delta
        if (!session.isAssistantSpeaking) {
          session.isAssistantSpeaking = true;
          console.log(`🔇 Pausing input audio processing (assistant speaking)`);
        }
        handleOutgoingAudio(session, message);
        break;
        
      case 'response.audio.done':
        console.log(`✅ CORA finished speaking`);
        session.isAssistantSpeaking = false;
        console.log(`🎤 RESUMING INPUT - caller can now be heard again`);
        recordFirstAudio(session.callSid);
        break;
        
      case 'response.created':
        console.log(`🎯 Response created: ${message.response?.id || 'unknown'}`);
        break;
        
      case 'response.done':
        console.log(`✅ Response completed: ${message.response?.id || 'unknown'}`);
        // CRITICAL: Ensure half-duplex flag is reset even if audio.done was missed
        if (session.isAssistantSpeaking) {
          session.isAssistantSpeaking = false;
          console.log(`🎤 FORCE RESUMING INPUT - backup flag reset`);
        }
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        const timeSinceCommit = Date.now() - session.lastCommit;
        console.log(`🎤 TRANSCRIPTION ✅: "${message.transcript}" (${timeSinceCommit}ms after commit)`);
        console.log(`📊 ASR SANITY: Speaking 2-3s → transcription in ${timeSinceCommit}ms ✅`);
        if (session.dbCallId) {
          await db.addCallTurn({
            call_id: session.dbCallId,
            ts: new Date().toISOString(),
            role: 'user',
            text: message.transcript,
            event_type: 'transcription_completed',
            raw: message
          });
        }
        break;
        
      case 'conversation.item.input_audio_transcription.failed':
        console.log(`❌ Transcription failed: ${message.error?.message || 'unknown error'}`);
        break;
        
      case 'input_audio_buffer.committed':
        console.log(`✅ SERVER_VAD COMMIT: OpenAI committed buffer automatically`);
        session.lastCommit = Date.now(); // Track for transcription timing
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log(`🔇 Speech stopped detected`);
        break;
        
      case 'conversation.item.created':
        if (message.item?.type === 'audio') {
          console.log(`🎵 Audio item created: ${message.item.id}`);
        }
        break;
        
      case 'response.function_call_arguments.done':
        // This is now handled by handleRealtimeEvent
        // Log to database
        if (session.dbCallId && message.name) {
          const duration = 100; // placeholder
          recordToolExecution(session.callSid, message.name, duration);
        }
        break;
        
      case 'response.text.done':
        console.log(`🤖 Assistant: "${message.text}"`);
        if (session.dbCallId) {
          await db.addCallTurn({
            call_id: session.dbCallId,
            ts: new Date().toISOString(),
            role: 'assistant',
            text: message.text,
            event_type: 'response_text_done',
            raw: message
          });
        }
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log(`🗣️ Speech started - potential barge-in`);
        handleBargeIn(session);
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log(`🔇 Speech stopped detected - server_vad will handle commit automatically`);
        break;
        
      case 'error':
        console.error(`❌ Realtime error:`, message.error);
        break;
    }
  } catch (error) {
    console.error(`❌ Error parsing Realtime message:`, error);
  }
}

/**
 * Handle outgoing audio from OpenAI (PCM16 16kHz -> μ-law 8kHz)
 */
function handleOutgoingAudio(session: CallSession, message: any): void {
  try {
    // Extract base64 μ-law chunk from OpenAI
    const b64 = message.audio ?? message.delta;
    if (!b64) {
      console.log(`⚠️ No audio data in response.audio.delta`);
      return;
    }
    
    console.log(`🎵 Processing CORA audio: ${b64.length} chars base64`);
    
    // CRITICAL: OpenAI now sends μ-law directly (no conversion needed)
    const mulawData = Buffer.from(b64, 'base64');
    console.log(`🔄 Received μ-law: ${mulawData.length} bytes`);
    
    // Log first few bytes for debugging
    console.log(`🔍 μ-law first 8 bytes: ${mulawData.subarray(0, 8).toString('hex')}`);
    
    // Break into 160-byte frames (20ms each) and queue them
    for (let i = 0; i < mulawData.length; i += 160) {
      const frame = mulawData.subarray(i, i + 160);
      if (frame.length === 160) { // Only queue complete frames
        session.outgoingQueue.push(frame);
      }
    }
    
    console.log(`📦 Queued ${Math.floor(mulawData.length / 160)} frames (160 bytes each)`);
    
    // CRITICAL: Send clear event before new audio (prevent feedback)
    if (session.outgoingQueue.length === Math.floor(mulawData.length / 160)) {
      console.log('🧹 Clearing Twilio outbound track before CORA speaks');
      session.twilioWs.send(JSON.stringify({
        event: 'clear',
        streamSid: session.streamSid,
        track: 'outbound'
      }));
      
      // Send mark after queuing ~0.5s of audio to verify playback
      if (session.outgoingQueue.length >= 25) { // 25 frames = 500ms
        const markId = `mark_${Date.now()}`;
        console.log(`📍 Sending playback mark: ${markId}`);
        session.twilioWs.send(JSON.stringify({
          event: 'mark',
          streamSid: session.streamSid,
          mark: { name: markId }
        }));
      }
    }
    
    // Start the output timer if not already running
    if (!session.outputTimer) {
      startOutputTimer(session);
    }
    
  } catch (error) {
    console.error(`❌ Error processing outgoing audio:`, error);
  }
}

/**
 * Start 20ms timer to send queued audio frames to Twilio
 */
function startOutputTimer(session: CallSession): void {
  let framesSent = 0;
  let lastSecond = Math.floor(Date.now() / 1000);
  
  session.outputTimer = setInterval(() => {
    const frame = session.outgoingQueue.shift();
    if (!frame) return; // No frames to send
    
    // Fix #6: Exact 160-byte μ-law frame format
    if (frame.length !== 160) {
      console.warn(`⚠️ Frame size mismatch: ${frame.length} bytes (expected 160)`);
      return;
    }
    
    const payload = frame.toString('base64');
    // CRITICAL: Minimal Twilio frame (ChatGPT spec - no extra fields)
    const twilioFrame = {
      event: 'media',
      streamSid: session.streamSid,
      media: {
        payload: payload
      }
    };
    
    framesSent++;
    const currentSecond = Math.floor(Date.now() / 1000);
    
    // CRITICAL: Outbound diagnostics (ChatGPT spec - queue depth, fps, μ-law bytes)
    if (currentSecond !== lastSecond) {
      const queueDepth = session.outgoingQueue.length;
      const first8Hex = frame.subarray(0, 8).toString('hex');
      console.log(`📊 Outbound: ${framesSent} frames/sec, queue: ${queueDepth}, first8: ${first8Hex}`);
      framesSent = 0;
      lastSecond = currentSecond;
    }
    
    session.twilioWs.send(JSON.stringify(twilioFrame));
    
  }, 20); // Send one frame every 20ms
}

/**
 * Handle barge-in (caller interrupts assistant)
 */
function handleBargeIn(session: CallSession): void {
  if (!session.hasBargein) {
    console.log(`🗣️ Barge-in detected for call ${session.callSid}`);
    session.hasBargein = true;
    
    // Clear any queued assistant audio
    session.twilioWs.send(JSON.stringify({
      event: 'clear'
    }));
    
    // CRITICAL: Let server_vad handle barge-in commits (no manual commits)
    console.log(`🗣️ Barge-in detected - server_vad will handle buffer automatically`);
  }
}


/**
 * Initialize call in database
 */
async function initializeCallDatabase(session: CallSession, startMessage: any): Promise<void> {
  try {
    const callerNumber = startMessage.start?.caller || 'unknown';
    session.callerNumber = callerNumber;
    
    const callId = await db.createCall({
      tenant_id: session.tenant.agentDisplayName, // Use agent name as tenant ID for now
      twilio_sid: session.callSid,
      started_at: new Date().toISOString(),
      caller_number: callerNumber,
      agent_number: session.toNumber
    });
    
    session.dbCallId = callId;
    console.log(`📝 Initialized call in database: ${callId}`);
    
  } catch (error) {
    console.error(`❌ Error initializing call in database:`, error);
  }
}

/**
 * Cleanup call session
 */
async function cleanupCall(callSid: string): Promise<void> {
  const session = activeCalls.get(callSid);
  if (session) {
    // Update call in database
    if (session.dbCallId) {
      try {
        await db.updateCall(session.dbCallId, {
          ended_at: new Date().toISOString()
        });
        
        // Generate and save call summary
        const summary = await db.generateCallSummary(session.dbCallId);
        if (summary) {
          await db.saveCallSummary({
            call_id: session.dbCallId,
            summary_json: summary,
            score_lead_quality: Math.round(summary.confidence * 100),
            next_actions: summary.next_actions,
            properties_mentioned: summary.properties_mentioned
          });
        }
        
        console.log(`📊 Generated summary for call ${session.dbCallId}`);
        
      } catch (error) {
        console.error(`❌ Error updating call in database:`, error);
      }
    }
    
    // Stop output timer and clear queue
    if (session.outputTimer) {
      clearInterval(session.outputTimer);
      session.outputTimer = undefined;
    }
    session.outgoingQueue.length = 0;
    
    // Close Realtime connection
    if (session.realtimeWs) {
      session.realtimeWs.close();
    }
    
    // Finish metrics
    finishCallMetrics(callSid);
    
    // Remove from active calls
    activeCalls.delete(callSid);
    
    console.log(`🧹 Cleaned up call ${callSid}`);
  }
}