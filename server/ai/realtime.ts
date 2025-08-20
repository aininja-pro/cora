/**
 * OpenAI Realtime API helpers
 */
import OpenAI from 'openai';
import { WebSocket } from 'ws';
import { executeTools } from './tools';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface RealtimeSession {
  client_secret: {
    value: string;
    expires_at: number;
  };
}

/**
 * Create ephemeral session for OpenAI Realtime API
 */
export async function createEphemeralSession(instructions: string, voice: string = "verse"): Promise<RealtimeSession> {
  // Note: The OpenAI SDK may not have realtime support yet
  // We'll use the REST API directly for now
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-realtime-preview",
        voice: voice,
        modalities: ["audio", "text"],
        instructions: instructions,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200
        },
        input_audio_transcription: {
          model: "whisper-1"
        },
        tools: require('./tools').TOOLS,
        tool_choice: "auto"
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const session = await response.json() as RealtimeSession;
    return session;
  } catch (error) {
    console.error('Error creating ephemeral session:', error);
    throw error;
  }
}

/**
 * Handle tool execution for Realtime WebSocket
 */
export async function handleToolCall(ws: WebSocket, callId: string, toolName: string, args: string, callSid?: string): Promise<void> {
  try {
    const parsedArgs = JSON.parse(args);
    const result = await executeTools(toolName, parsedArgs);
    
    // Log to database if callSid provided
    if (callSid) {
      // TODO: Log to Supabase tool_calls table
      console.log(`📝 Tool call logged: ${toolName} for call ${callSid}`);
    }
    
    // Send result back to Realtime API
    const response = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result)
      }
    };
    
    ws.send(JSON.stringify(response));
    
    // Nudge model to continue
    ws.send(JSON.stringify({ type: "response.create" }));
    
  } catch (error) {
    console.error(`❌ Tool execution failed for ${toolName}:`, error);
    
    // Send error response
    const errorResponse = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({
          ok: false,
          error: {
            code: "TOOL_FAILED",
            message: error instanceof Error ? error.message : "Unknown error",
            retryable: false
          }
        })
      }
    };
    
    ws.send(JSON.stringify(errorResponse));
    ws.send(JSON.stringify({ type: "response.create" }));
  }
}

/**
 * Send audio to Realtime API
 */
export function sendAudioToRealtime(ws: WebSocket, audioData: string): void {
  const payload = {
    type: "input_audio_buffer.append",
    audio: audioData
  };
  
  // ChatGPT's diagnostic: Log first few chars of payload
  if (audioData.length > 850) { // Only log full frames
    console.log(`📡 Sending to OpenAI: type="${payload.type}", audio.length=${audioData.length}, first10="${audioData.substring(0, 10)}"`);
  }
  
  ws.send(JSON.stringify(payload));
}

/**
 * Commit audio buffer to trigger processing
 */
export function commitAudioBuffer(ws: WebSocket): void {
  console.log(`📡 Sending input_audio_buffer.commit to OpenAI`);
  ws.send(JSON.stringify({
    type: "input_audio_buffer.commit"
  }));
}

/**
 * Clear audio buffer (for barge-in)
 */
export function clearAudioBuffer(ws: WebSocket): void {
  ws.send(JSON.stringify({
    type: "input_audio_buffer.clear"
  }));
}