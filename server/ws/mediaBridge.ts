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
import { makeBackendClient } from '../lib/backendClient';
import { WhisperFeeder } from '../lib/whisperFeeder';
import { bindRealtime, sendToOpenAI, FEEDER_TOKEN } from '../lib/realtimeSend';
import { createRealtimeForCall } from '../lib/realtimeInit';
import { flushBacklog } from '../lib/transcriptPersistence';
import { CallCtx, makeCallCtx } from '../lib/callCtx';
import { wireRealtimeTracer } from '../lib/tracer';
import { triggerAgentSummary, triggerShowingConfirm } from '../ai/triggers';
import WebSocket from 'ws';

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
  backendClient?: any;
  whisperFeeder?: WhisperFeeder;
  bytesSinceCommit: number; // Track bytes for proper commit gating
  outgoingQueue: Buffer[]; // Queue for 160-byte μ-law frames
  outputTimer?: NodeJS.Timeout; // 20ms timer for paced audio output
  isAssistantSpeaking: boolean; // Half-duplex flag to prevent feedback
  callCtx?: CallCtx; // Shared context for transcripts
  isCleanedUp?: boolean; // Idempotency flag for cleanup
  
  // Professional audio buffering system
  audioAggregator: Buffer; // Accumulates deltas before frame slicing
  carryoverBytes: Buffer; // Holds incomplete frames
  isAudioSending: boolean; // Tracks if timer is actively sending
  framesSentCount: number; // Total frames sent for this TTS segment
  
  // Buffer management metrics
  underrunCount: number;
  queueDepthHistory: number[];
  
  // Water mark thresholds (in frames)
  readonly HIGH_WATER_FRAMES: number; // 480ms = 24 frames
  readonly LOW_WATER_FRAMES: number;  // 240ms = 12 frames
  readonly MIN_BUFFER_FRAMES: number; // 240ms = 12 frames minimum
}

const activeCalls = new Map<string, CallSession>();

// simple id for logs
function id(ws: WebSocket) { return (ws as any)._rtid ?? ((ws as any)._rtid = Math.random().toString(36).slice(2,7)); }

// --- transcript persistence helpers ---
type PersistCtx = {
  callId: string;
  backendClient?: { postEvent: (callId: string, evt: any) => Promise<any> };
  backlog?: Array<{ role: "user" | "assistant"; text: string; ts: string }>;
  last?: { user?: string; assistant?: string }; // simple de-dupe
};

function ensureCtx(session: any): PersistCtx {
  if (!session._persistCtx) {
    session._persistCtx = { callId: session.dbCallId, backendClient: session.backendClient, backlog: [], last: {} };
  } else {
    // keep client fresh (in case it was attached after WS opened)
    session._persistCtx.backendClient = session.backendClient ?? session._persistCtx.backendClient;
  }
  return session._persistCtx;
}

async function persistTurn(ctx: PersistCtx, role: "user" | "assistant", text: string) {
  text = (text || "").trim();
  if (!text) return;
  // de-dupe exact repeats to avoid double-saves
  if (ctx.last?.[role] === text) return;
  ctx.last![role] = text;

  const row = { type: "turn", role, text, ts: new Date().toISOString() };

  if (!ctx.backendClient) {
    ctx.backlog!.push({ role, text, ts: row.ts });
    console.warn("TRANSCRIPT BACKLOG +1 (no backendClient yet)");
    return;
  }
  try {
    const r = await ctx.backendClient.postEvent(ctx.callId, row);
    if (!r?.ok) console.error("postEvent failed", r?.status, r?.body?.slice?.(0,200));
    else console.log("DB ✓", role, text.slice(0,80));
  } catch (err) {
    console.error("postEvent exception", err);
  }
}

async function flushBacklog(ctx: PersistCtx) {
  if (!ctx.backendClient || !ctx.backlog?.length) return;
  console.log(`FLUSHING ${ctx.backlog.length} transcript rows`);
  for (const b of ctx.backlog.splice(0)) {
    await ctx.backendClient!.postEvent(ctx.callId, { type:"turn", role:b.role, text:b.text, ts:b.ts });
  }
}

// Log the first ~50 media frames so we see shape/track
let dbgFrames = 0;
function dbgTwilio(msg: any) {
  if (dbgFrames > 50) return;
  if (msg?.event === "media") {
    dbgFrames++;
    const len = msg.media?.payload?.length ?? 0;
    console.log("TW media", { track: msg.track ?? "(none)", len });
  } else if (msg?.event === "start") {
    console.log("TW start", {
      track: msg.start?.track ?? "(none)",
      fmt: msg.start?.mediaFormat,
      streamSid: msg.start?.streamSid
    });
  } else if (msg?.event === "stop") {
    console.log("TW stop");
  }
}

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
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(Buffer.from(data as any).toString());
      
      // CRITICAL: Debug what Twilio is actually sending (ChatGPT Step 1)
      dbgTwilio(message);
      
      // Handle the start event to get callSid and other details
      if (message.event === 'start') {
        console.log('📋 Raw start message:', JSON.stringify(message, null, 2));
        callSid = message.start?.callSid || message.callSid;
        const streamSid = message.streamSid || message.start?.streamSid;
        const from = message.start?.customParameters?.from || message.start?.from || 'unknown';
        const to = message.start?.customParameters?.to || message.start?.to;
        
        console.log(`🔗 Media stream started for call ${callSid}`);
        console.log(`   Stream SID: ${streamSid}`);
        console.log(`   From: ${from} → To: ${to}`);
        
        // Extract toNumber for tenant lookup
        toNumber = to;
        const tenant = getTenantByToNumber(toNumber);
        
        // Initialize the session first (without callCtx yet)
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
          callerNumber: from,  // Set caller number from extracted value
          bytesSinceCommit: 0, // Not used with server_vad but keeping for debugging
          outgoingQueue: [],
          outputTimer: undefined,
          isAssistantSpeaking: false,
          
          // Professional audio buffering initialization
          audioAggregator: Buffer.alloc(0),
          carryoverBytes: Buffer.alloc(0),
          isAudioSending: false,
          framesSentCount: 0,
          
          // Buffer metrics
          underrunCount: 0,
          queueDepthHistory: [],
          
          // Water mark constants
          HIGH_WATER_FRAMES: 24, // 480ms
          LOW_WATER_FRAMES: 12,  // 240ms  
          MIN_BUFFER_FRAMES: 12  // 240ms minimum
        };
        
        activeCalls.set(callSid, session);
        startCallMetrics(callSid);
        
        // Initialize call with Python backend to get proper call_id
        await initializeCallWithBackend(session, message);
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
    
    const ctx = session.callCtx!;
    const model = "gpt-4o-mini-realtime-preview";
    const apiKey = process.env.OPENAI_API_KEY!;
    const voice = session.tenant.voice || 'verse';
    
    // Create WebSocket directly
    console.log("KEY_FPRINT", process.env.OPENAI_API_KEY?.slice(0,8), "proj:", process.env.OPENAI_PROJECT || "none");
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const realtimeWs = new WebSocket(url, {
      headers: { 
        Authorization: `Bearer ${apiKey}`, 
        "OpenAI-Beta": "realtime=v1",
        "OpenAI-Project": process.env.OPENAI_PROJECT
      },
    });
    
    session.realtimeWs = realtimeWs;
    
    realtimeWs.on("open", () => {
      console.log(`RT:OPEN call=${ctx.callId} ws=${id(realtimeWs)}`);
      // bind send wrapper to THIS socket
      bindRealtime(realtimeWs);
      console.log(`SEND:BOUND ws= ${id(realtimeWs)}`);
      
      // right after ws 'open'
      let _msgCount = 0;
      let _typesSeen = 0;
      realtimeWs.on("message", (raw: Buffer) => {
        _msgCount++;
        if (_msgCount <= 10) console.log("WSMSG", _msgCount, raw?.length ?? 0);
        
        if (_typesSeen >= 30) return;
        try {
          const e = JSON.parse(raw.toString());
          console.log("EVT", ++_typesSeen, e.type);
        } catch { /* ignore */ }
      });
      
      // wire tracer only (persistence handled directly in handleRealtimeMessage)
      wireRealtimeTracer(realtimeWs);
      
      // Force modalities and transcription (send once, before audio)
      sendToOpenAI({
        type: "session.update",
        session: {
          // you're feeding Twilio μ-law 8k
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",

          // assistant text + audio events
          modalities: ["audio", "text"],

          // user STT
          input_audio_transcription: { model: "whisper-1", language: "en" },

          // VAD optimized for faster turn detection (target <900ms response time)
          turn_detection: { 
            type: "server_vad", 
            silence_duration_ms: 350,    // 500→350ms: faster end-of-speech
            prefix_padding_ms: 200,      // preserves word endings
            threshold: 0.44              // 0.50→0.44: more sensitive
          },
          
          voice: voice,
          instructions: instructions,
          tools: require('../ai/tools').TOOLS,
          tool_choice: 'auto'
        }
      });
    });
    
    // After session.updated, start feeder + flush edge case transcripts
    realtimeWs.on("message", async (raw) => {
      let e: any; 
      try { e = JSON.parse(raw.toString()); } catch { return; }
      
      if (e.type === "session.updated") {
        // Verify session accepted our config
        console.log("SESSION_VERIFY", {
          modalities: e.session?.modalities,
          input_transcription: e.session?.input_audio_transcription,
          turn_detection: e.session?.turn_detection?.type
        });
        
        session.whisperFeeder = new WhisperFeeder(
          (m) => sendToOpenAI(m, FEEDER_TOKEN),
          session.dbCallId,
          session.backendClient,
          process.env.OPENAI_API_KEY
        );
        session.whisperFeeder.markReady();
        console.log("🎯 WHISPER FEEDER READY");
        session.isConnected = true;
        
        // 🔑 FLUSH NOW (edge case: some transcripts may have arrived before client)
        await flushBacklog(ctx);
        
        // Send normal greeting
        console.log('🎤 Triggering greeting...');
        sendToOpenAI({
          type: "response.create",
          response: {
            instructions: 'Introduce yourself as CORA and ask how you can help.',
            modalities: ["audio", "text"]
          }
        });
      }
      
      // Also handle other events for tools etc
      handleRealtimeMessage(session, Buffer.from(raw as any));
    });
    
    realtimeWs.on('close', () => {
      console.log(`🔌 Realtime disconnected for call ${session.callSid}`);
    });
    
    realtimeWs.on('error', (error) => {
      console.error(`❌ Realtime error for call ${session.callSid}:`, error);
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
        await initializeCallWithBackend(session, message);
        break;
        
      case 'media':
        // ChatGPT Step 2: Fix predicate - treat anything not explicitly outbound as inbound
        if (message.event === "media" && message.track !== "outbound") {
          session.whisperFeeder?.onInboundMulawBase64(message.media.payload);
        }
        // DO NOT call any other input_audio_buffer.append/commit anywhere else
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
  
  
  // Note: WhisperFeeder handles inbound audio directly, this function now only needed for legacy processing
  return;
  
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
    
    // Note: WhisperFeeder now handles all audio processing
    // This legacy path is disabled
    
    console.log(`📡 Sent ${finalBuffer.length} bytes PCM16 to OpenAI (VAD only)`);
    session.lastCommit = Date.now();
    
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
    
    const persistCtx = ensureCtx(session);  // ← session.dbCallId + session.backendClient

    // 0) when session.updated lands, flush any backlog that arrived early
    if (message.type === "session.updated") {
      await flushBacklog(persistCtx);
    }

    // 1) USER transcripts (the ones you already see in logs)
    if (message.type === "conversation.item.input_audio_transcription.completed") {
      const userText =
        message.transcript?.text ?? message.transcript ??
        message.item?.transcript?.text ?? message.item?.transcript ?? "";
      await persistTurn(persistCtx, "user", userText);
    }

    // 2) ASSISTANT text (if you also enabled output_text)
    if (message.type === "response.output_text.done") {
      const t = message.output_text?.length ? message.output_text.map((x:any)=>x.text?.value||"").join("") : message.text?.value || "";
      await persistTurn(persistCtx, "assistant", t || "");
    }

    // 3) ASSISTANT TTS transcript (you *are* seeing these)
    if (message.type === "response.audio_transcript.done") {
      await persistTurn(persistCtx, "assistant", message.transcript || "");
    }
    
    // Create send function for the handler
    const send = (payload: any) => {
      if (session.realtimeWs && session.isConnected) {
        session.realtimeWs.send(JSON.stringify(payload));
      }
    };
    
    // Create tool context with backend client
    const ctx: ToolContext = {
      tenantId: session.tenant?.agentDisplayName || 'default',
      callId: session.dbCallId,
      backendClient: session.backendClient
    };
    
    // Use the new handler for tool-related events
    await handleRealtimeEvent(message, send, ctx, session);
    
    // Handle other events
    switch (message.type) {
      case 'session.created':
        console.log(`✅ Realtime session created for call ${session.callSid}`);
        break;
        
      // session.updated now handled in realtimeWs.on('message') above
        
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
        console.log(`🎤 [${session.dbCallId}] OPENAI TRANSCRIPTION ✅: "${message.transcript}" (${timeSinceCommit}ms after commit)`);
        console.log(`📊 ASR SANITY: Speaking 2-3s → transcription in ${timeSinceCommit}ms ✅`);
        
        // CRITICAL: Stream final user turn to backend AND save to database
        if (session.backendClient && message.transcript) {
          try {
            await session.backendClient.addTurn("user", message.transcript, timeSinceCommit);
            console.log(`📝 [${session.dbCallId}] User turn streamed to backend`);
          } catch (error) {
            console.error(`❌ [${session.dbCallId}] Failed to stream user turn:`, error);
          }
        }
        break;
        
      case 'conversation.item.input_audio_transcription.failed':
        console.log(`❌ [${session.dbCallId}] CRITICAL: Transcription failed: ${message.error?.message || 'unknown error'}`);
        console.log(`🔍 [${session.dbCallId}] This explains why CORA loops - she can't hear your words!`);
        console.log(`🔑 [${session.dbCallId}] Check OpenAI API key permissions for Whisper + Realtime`);
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
        console.log(`🤖 [${session.dbCallId}] Assistant: "${message.text}"`);
        
        // CRITICAL: Stream final assistant turn to backend  
        if (session.backendClient && message.text) {
          try {
            await session.backendClient.addTurn("assistant", message.text);
            console.log(`📝 [${session.dbCallId}] Assistant turn streamed to backend`);
          } catch (error) {
            console.error(`❌ [${session.dbCallId}] Failed to stream assistant turn:`, error);
          }
        }
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log(`🗣️ [${session.dbCallId}] BARGE-IN: Caller started speaking - halting CORA output`);
        handleBargeIn(session);
        
        // CRITICAL: Force stop assistant speaking immediately
        if (session.isAssistantSpeaking) {
          session.isAssistantSpeaking = false;
          console.log(`🛑 [${session.dbCallId}] FORCE STOPPED: Assistant interrupted by caller`);
        }
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
 * Professional audio buffering: Aggregate deltas → exact 160-byte frames → pre-buffer → deterministic send
 */
function handleOutgoingAudio(session: CallSession, message: any): void {
  try {
    // Extract base64 μ-law chunk from OpenAI
    const b64 = message.audio ?? message.delta;
    if (!b64) {
      console.log(`⚠️ No audio data in response.audio.delta`);
      return;
    }
    
    // STEP 1: Aggregate all deltas into single buffer
    const incomingData = Buffer.from(b64, 'base64');
    session.audioAggregator = Buffer.concat([session.audioAggregator, incomingData]);
    
    console.log(`🎵 Aggregated ${incomingData.length} bytes (total: ${session.audioAggregator.length})`);
    
    // STEP 2: Slice into exact 160-byte frames with carryover
    const totalBytes = session.carryoverBytes.length + session.audioAggregator.length;
    const combinedBuffer = Buffer.concat([session.carryoverBytes, session.audioAggregator]);
    
    const completeFrames = Math.floor(totalBytes / 160);
    const newFramesData = combinedBuffer.subarray(0, completeFrames * 160);
    session.carryoverBytes = combinedBuffer.subarray(completeFrames * 160); // Save remainder
    
    // Queue the complete frames
    for (let i = 0; i < newFramesData.length; i += 160) {
      const frame = newFramesData.subarray(i, i + 160);
      session.outgoingQueue.push(frame);
    }
    
    // Clear aggregator after processing
    session.audioAggregator = Buffer.alloc(0);
    
    const currentQueueFrames = session.outgoingQueue.length;
    const queueMs = currentQueueFrames * 20;
    
    console.log(`📦 Added ${completeFrames} frames | Queue: ${currentQueueFrames} frames (${queueMs}ms) | Carryover: ${session.carryoverBytes.length}b`);
    
    // STEP 3: Clear Twilio track on first audio (prevent feedback)
    if (!session.isAudioSending && currentQueueFrames > 0) {
      console.log('🧹 Clearing Twilio outbound track before TTS');
      session.twilioWs.send(JSON.stringify({
        event: 'clear',
        streamSid: session.streamSid,
        track: 'outbound'
      }));
    }
    
    // STEP 4: Pre-buffer check - start sending when we have enough frames
    if (!session.isAudioSending && currentQueueFrames >= session.MIN_BUFFER_FRAMES) {
      console.log(`🚀 PRE-BUFFER COMPLETE: Starting deterministic sender with ${currentQueueFrames} frames (${queueMs}ms buffered)`);
      startDeterministicAudioSender(session);
      
      // Send playback verification mark
      const markId = `prebuffer_${Date.now()}`;
      session.twilioWs.send(JSON.stringify({
        event: 'mark',
        streamSid: session.streamSid,
        mark: { name: markId }
      }));
    } else if (currentQueueFrames < session.MIN_BUFFER_FRAMES && currentQueueFrames > 0) {
      console.log(`⏳ BUFFERING: ${currentQueueFrames}/${session.MIN_BUFFER_FRAMES} frames (need ${session.MIN_BUFFER_FRAMES - currentQueueFrames} more)`);
    }
    
    // STEP 5: High-water mark check (back-pressure)
    if (currentQueueFrames > session.HIGH_WATER_FRAMES) {
      console.warn(`🌊 HIGH WATER: ${currentQueueFrames} frames (${queueMs}ms) > ${session.HIGH_WATER_FRAMES * 20}ms limit`);
    }
    
  } catch (error) {
    console.error(`❌ Error in professional audio handling:`, error);
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
 * Deterministic 20ms audio sender with monotonic clock and catch-up logic
 */
function startDeterministicAudioSender(session: CallSession): void {
  if (session.isAudioSending) {
    console.log(`⚠️ Audio sender already running for call ${session.callSid}`);
    return;
  }
  
  session.isAudioSending = true;
  const audioStartTime = process.hrtime.bigint();
  session.framesSentCount = 0;
  
  let framesSentThisSecond = 0;
  let lastSecond = Math.floor(Date.now() / 1000);
  let underrunThisCall = 0;
  
  console.log(`🎯 DETERMINISTIC SENDER: Started with monotonic clock`);
  
  session.outputTimer = setInterval(() => {
    const currentTime = process.hrtime.bigint();
    const elapsedNs = currentTime - audioStartTime;
    const elapsedMs = Number(elapsedNs / BigInt(1000000));
    
    // Calculate how many frames SHOULD have been sent by now (50fps = 20ms intervals)
    const expectedFrames = Math.floor(elapsedMs / 20);
    const framesBehind = expectedFrames - session.framesSentCount;
    
    // Catch-up logic: send multiple frames if we're behind (GC hiccups, etc.)
    const framesToSend = Math.min(framesBehind + 1, 3); // Max 3 frames per tick
    
    for (let i = 0; i < framesToSend; i++) {
      const frame = session.outgoingQueue.shift();
      if (!frame) {
        // UNDERRUN: queue is empty but we need to send
        underrunThisCall++;
        session.underrunCount++;
        console.warn(`🚨 UNDERRUN #${underrunThisCall}: No frame available at ${elapsedMs}ms (expected frame ${expectedFrames})`);
        break;
      }
      
      // Validate frame size
      if (frame.length !== 160) {
        console.error(`💥 CRITICAL: Frame size ${frame.length} ≠ 160 bytes`);
        continue;
      }
      
      // Send to Twilio
      const payload = frame.toString('base64');
      const twilioFrame = {
        event: 'media',
        streamSid: session.streamSid,
        media: { payload }
      };
      
      session.twilioWs.send(JSON.stringify(twilioFrame));
      session.framesSentCount++;
      framesSentThisSecond++;
    }
    
    // Queue depth monitoring and metrics
    const currentSecond = Math.floor(Date.now() / 1000);
    const queueFrames = session.outgoingQueue.length;
    const queueMs = queueFrames * 20;
    
    // Log metrics every second
    if (currentSecond !== lastSecond) {
      // Track queue depth history
      session.queueDepthHistory.push(queueMs);
      if (session.queueDepthHistory.length > 10) {
        session.queueDepthHistory.shift(); // Keep last 10 seconds
      }
      
      const avgQueueMs = session.queueDepthHistory.reduce((a, b) => a + b, 0) / session.queueDepthHistory.length;
      const driftMs = elapsedMs - (session.framesSentCount * 20);
      
      console.log(`📊 AUDIO METRICS: ${framesSentThisSecond}fps | Queue: ${queueMs}ms | Avg: ${avgQueueMs.toFixed(0)}ms | Drift: ${driftMs.toFixed(1)}ms | Underruns: ${underrunThisCall}`);
      
      framesSentThisSecond = 0;
      lastSecond = currentSecond;
    }
    
    // Stop condition: queue empty and TTS finished
    if (queueFrames === 0 && !session.isAssistantSpeaking) {
      console.log(`🔚 QUEUE EMPTY: Stopping sender (TTS completed)`);
      stopDeterministicAudioSender(session);
    }
    
  }, 10); // Check every 10ms (twice as fast as frame rate for precision)
}

/**
 * Stop the deterministic audio sender
 */
function stopDeterministicAudioSender(session: CallSession): void {
  if (session.outputTimer) {
    clearInterval(session.outputTimer);
    session.outputTimer = undefined;
  }
  
  session.isAudioSending = false;
  
  const finalQueueFrames = session.outgoingQueue.length;
  const finalQueueMs = finalQueueFrames * 20;
  
  console.log(`🏁 SENDER STOPPED: ${session.framesSentCount} frames sent, ${finalQueueMs}ms remaining, ${session.underrunCount} total underruns`);
}

/**
 * Handle barge-in (caller interrupts assistant)
 */
function handleBargeIn(session: CallSession): void {
  if (!session.hasBargein) {
    console.log(`🗣️ [${session.dbCallId}] Barge-in detected for call ${session.callSid}`);
    session.hasBargein = true;
    
    // Clear any queued assistant audio
    session.twilioWs.send(JSON.stringify({
      event: 'clear'
    }));
    
    // Stream barge-in event to backend
    if (session.backendClient) {
      try {
        session.backendClient.addStatus("barge_in", {
          twilio_sid: session.callSid,
          timestamp: new Date().toISOString()
        });
        console.log(`📝 [${session.dbCallId}] Barge-in event streamed to backend`);
      } catch (error) {
        console.error(`❌ [${session.dbCallId}] Failed to stream barge-in event:`, error);
      }
    }
    
    console.log(`🗣️ Barge-in detected - server_vad will handle buffer automatically`);
  }
}

/**
 * Determine call outcome based on session activity
 */
function determineCallOutcome(session: CallSession): string {
  // TODO: Analyze session events to determine actual outcome
  // For now, return generic outcome
  return "info"; // Default: informational call
}

/**
 * Initialize call with Python backend
 */
async function initializeCallWithBackend(session: CallSession, startMessage: any): Promise<void> {
  try {
    // Extract caller number from multiple possible fields
    const callerNumber = startMessage.start?.caller || 
                        startMessage.start?.customParameters?.from || 
                        startMessage.start?.from || 
                        startMessage.from ||
                        'unknown';
    
    console.log(`📞 [${session.callSid}] Extracted caller: ${callerNumber} from Twilio start event`);
    session.callerNumber = callerNumber;
    
    // Create call via backend API first to get JWT
    const createCallRequest = {
      tenant_id: session.tenant.agentDisplayName, // Use agent name as tenant ID for now
      caller_number: callerNumber,
      agent_number: session.toNumber,
      twilio_sid: session.callSid
    };
    
    console.log(`🔗 Creating call via backend API: ${JSON.stringify(createCallRequest)}`);
    
    const response = await fetch(`${process.env.BACKEND_BASE_URL}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createCallRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create call: ${response.status}`);
    }
    
    const callData = await response.json();
    session.dbCallId = callData.call_id;
    
    // Create shared call context with proper call_id from backend
    const ctx = makeCallCtx(callData.call_id);
    session.callCtx = ctx;
    
    // CRITICAL: Create backend client immediately after JWT 
    ctx.backendClient = makeBackendClient(
      process.env.BACKEND_BASE_URL!,
      callData.jwt_token
    );
    session.backendClient = ctx.backendClient;
    
    console.log("BACKEND READY", {
      hasClient: !!session.backendClient,
      baseUrl: session.backendClient?.baseUrl,
    });
    
    // Hard assert so we don't proceed half-initialized
    if (!session.backendClient) {
      throw new Error("backendClient missing; aborting call setup");
    }
    
    console.log(`📝 [${callData.call_id}] Call initialized via backend - JWT acquired, tenant: ${callData.tenant.name}`);
    
    // Initialize OpenAI Realtime connection now that we have the backend client
    await initializeRealtimeConnection(session);
    
    // Send call_started status event
    try {
      await session.backendClient.postEvent(session.dbCallId, {
        type: "turn",
        role: "assistant", 
        text: `Call started with ${callerNumber}`,
        ts: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ Failed to post call start event:`, error);
    }
    
    console.log(`🎤 [${session.dbCallId}] Ready for WhisperFeeder initialization after session.updated`);
    
  } catch (error) {
    console.error(`❌ [${session.callSid}] Error initializing call with backend:`, error);
    // Fallback to local logging if backend unavailable
    session.dbCallId = `local_${Date.now()}`;
  }
}

/**
 * Cleanup call session
 */
export async function cleanupCall(callSid: string, reason?: string): Promise<void> {
  const session = activeCalls.get(callSid);
  
  console.log(`🧹 Cleanup called for ${callSid} (reason: ${reason || 'unknown'})`);

  if (session) {
    // Idempotency: prevent double cleanup
    if (session.isCleanedUp) {
      console.log(`⚠️ Call ${callSid} already cleaned up, skipping (reason: ${reason})`);
      return;
    }
    session.isCleanedUp = true;
    console.log(`🧹 Cleaning up active call session ${callSid}`);
  } else {
    // Call session not in memory - try to trigger SMS from database
    console.log(`📱 Call ${callSid} not in memory, triggering SMS via database lookup`);
    
    try {
      // Send SMS via backend API directly using the call ID
      const response = await fetch(`${process.env.BACKEND_BASE_URL}/api/calls/${callSid}/trigger-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'status-callback' })
      });
      
      if (response.ok) {
        console.log(`✅ SMS triggered for call ${callSid} via database`);
      } else {
        console.log(`⚠️ Failed to trigger SMS for call ${callSid}: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Error triggering SMS for call ${callSid}: ${error}`);
    }
    return;
  }

  if (session) {
    // Send call end summary and trigger analysis
    if (session.backendClient && session.dbCallId) {
      try {
        // Generate simple summary and outcome
        const outcome = determineCallOutcome(session);
        const summary = `Call with ${session.callerNumber || 'unknown caller'} ended after ${Math.round((Date.now() - session.lastCommit) / 1000)}s`;
        const nextActions = ["Follow up within 24 hours", "Send property listings if requested"];
        
        await session.backendClient.addSummary(outcome, summary, nextActions);
        console.log(`📊 [${session.dbCallId}] Call summary sent to backend: ${outcome}`);
        
        // Trigger SMS notification to agent
        await triggerAgentSummary(session, summary, outcome, nextActions);
        
        // Trigger GPT analysis for rich UI (async)
        setTimeout(async () => {
          try {
            const response = await fetch(`${process.env.BACKEND_BASE_URL}/api/calls/${session.dbCallId}/analyze`, {
              method: 'POST'
            });
            
            if (response.ok) {
              console.log(`🧠 [${session.dbCallId}] GPT analysis completed - call card will be enriched`);
            } else {
              console.log(`⚠️ [${session.dbCallId}] GPT analysis failed: ${response.status}`);
            }
          } catch (error) {
            console.log(`❌ [${session.dbCallId}] GPT analysis error:`, error);
          }
        }, 2000); // Wait 2s for transcript to settle
        
      } catch (error) {
        console.error(`❌ [${session.dbCallId}] Error sending call summary:`, error);
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
    
    // Flush and stop WhisperFeeder
    if (session.whisperFeeder) {
      session.whisperFeeder.flushAndStop();
      console.log(`🎙️ WhisperFeeder flushed and stopped`);
    }
    
    // Finish metrics
    finishCallMetrics(callSid);
    
    // Remove from active calls
    activeCalls.delete(callSid);
    
    console.log(`🧹 Cleaned up call ${callSid}`);
  }
}