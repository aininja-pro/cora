// realtimeTranscripts.ts
// Wire this into your Realtime WebSocket to persist user + assistant transcripts.

type BackendClient = {
  postEvent: (callId: string, evt: {
    type: "turn",
    role: "user" | "assistant",
    text: string,
    ts: string
  }) => Promise<void>;
};

export function wireRealtimeTranscriptPersistence(opts: {
  ws: import("ws");           // your Realtime WS (already connected)
  callId: string;
  backendClient: BackendClient;
  log?: (msg: string, meta?: any) => void;
  captureTTS?: boolean;       // set true if you also want assistant TTS transcript
}) {
  const { ws, callId, backendClient, log = console.log, captureTTS = false } = opts;

  let assistantTextBuf = "";
  let assistantTTSBuf = "";

  ws.on("message", async (raw: Buffer) => {
    let e: any;
    try { e = JSON.parse(raw.toString()); } catch { return; }

    // 1) USER transcripts (Whisper)
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      // Robust extraction across shapes
      const text =
        (e.transcript?.text ?? e.transcript ?? e.item?.transcript?.text ?? e.item?.transcript ?? "").trim();

      // Ignore empties
      if (!text) return;

      log("👤 USER", text);
      try {
        await backendClient.postEvent(callId, {
          type: "turn",
          role: "user",
          text,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        console.error("postEvent(user) failed", err);
      }
      return;
    }

    // 2) ASSISTANT text (the content CORA "says")
    if (e.type === "response.output_text.delta") {
      if (typeof e.delta === "string") assistantTextBuf += e.delta;
      return;
    }
    if (e.type === "response.output_text.done") {
      const text = assistantTextBuf.trim();
      assistantTextBuf = "";
      if (!text) return;

      log("🤖 CORA", text);
      try {
        await backendClient.postEvent(callId, {
          type: "turn",
          role: "assistant",
          text,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        console.error("postEvent(assistant) failed", err);
      }
      return;
    }

    // 3) (Optional) ASSISTANT TTS transcript (if you want it too)
    if (captureTTS && e.type === "response.audio_transcript.delta") {
      if (typeof e.delta === "string") assistantTTSBuf += e.delta;
      return;
    }
    if (captureTTS && e.type === "response.audio_transcript.done") {
      const text = assistantTTSBuf.trim();
      assistantTTSBuf = "";
      if (!text) return;

      log("🔊 CORA (tts)", text);
      try {
        await backendClient.postEvent(callId, {
          type: "turn",
          role: "assistant",
          text,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        console.error("postEvent(assistant-tts) failed", err);
      }
      return;
    }

    // 4) Visibility for debugging
    if (e.type === "error") {
      console.error("Realtime error", e);
    }
  });
}