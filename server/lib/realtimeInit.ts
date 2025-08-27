// realtimeInit.ts
import WebSocket from "ws";
import { wireRealtimeTracer } from "./tracer";
import { wireRealtimeTranscriptPersistenceV4 } from "./realtimeTranscriptsV4";
import { bindRealtime, sendToOpenAI } from "./realtimeSend"; // your wrapper

export function createRealtimeForCall(opts: {
  callId: string;
  backendClient: any;
  model?: string;
  apiKey: string;
  instructions?: string;
  voice?: string;
}) {
  const { callId, backendClient, model = "gpt-4o-mini-realtime-preview", apiKey, instructions, voice } = opts;

  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
  const ws = new WebSocket(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "OpenAI-Beta": "realtime=v1" },
  });

  // Minimal observability
  ws.on("open", () => {
    console.log(`RT:OPEN call=${callId} ws=${id(ws)}`);
    // bind send wrapper to THIS socket
    bindRealtime(ws);

    // wire tracer + V4 persistence BEFORE any session.update or audio
    wireRealtimeTracer(ws);
    wireRealtimeTranscriptPersistenceV4({
      ws,
      callId,
      backendClient,
      captureTTS: true, // since you saw response.audio_transcript.done
    });

    // now lock the session with full config
    sendToOpenAI({
      type: "session.update",
      session: {
        input_audio_transcription: { model: "whisper-1", language: "en" },
        input_audio_format: "g711_ulaw",  // you're feeding μ-law
        output_audio_format: "g711_ulaw",
        modalities: ["audio", "text"],
        turn_detection: { type: "server_vad", silence_duration_ms: 220 },
        voice: voice || 'verse',
        instructions: instructions || 'You are a helpful assistant.',
        tools: require('../ai/tools').TOOLS,
        tool_choice: 'auto'
      },
    });
  });

  ws.on("close", (c) => console.log(`RT:CLOSE call=${callId} ws=${id(ws)} code=${c}`));
  ws.on("error", (e) => console.error(`RT:ERR call=${callId} ws=${id(ws)}`, e));

  return ws;
}

// simple id for logs
function id(ws: WebSocket) { return (ws as any)._rtid ?? ((ws as any)._rtid = Math.random().toString(36).slice(2,7)); }