// realtimeTranscriptsV3.ts
type BackendClient = {
  postEvent: (callId: string, evt: {
    type: "turn",
    role: "user" | "assistant",
    text: string,
    ts: string
  }) => Promise<{ ok: boolean; status?: number; error?: any } | void>;
};

export function wireRealtimeTranscriptPersistenceV3(opts: {
  ws: import("ws");
  callId: string;
  backendClient: BackendClient;
  log?: (msg: string, meta?: any) => void;
  captureTTS?: boolean; // if you want assistant TTS transcript too
}) {
  const { ws, callId, backendClient, log = console.log, captureTTS = false } = opts;

  console.log("📝 TRANSCRIPT PERSISTENCE WIRED (V3)");

  // Buffers for streaming forms
  let userBuf = "";
  let assistantBuf = "";
  let assistantTTSBuf = "";

  ws.on("message", async (raw: Buffer) => {
    let e: any;
    try { e = JSON.parse(raw.toString()); } catch { return; }

    // ========== USER TRANSCRIPTS (handle every known shape) ==========

    // (A) Completed user transcription — primary path
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      const text = extractText(e);
      if (text) await persistTurn(backendClient, callId, "user", text, log);
      userBuf = ""; // clear any partials
      return;
    }

    // (B) Streaming user transcription (delta/done) — some builds
    if (e.type === "conversation.item.input_audio_transcription.delta") {
      const delta = (e.delta || e.transcript || "").toString();
      if (delta) userBuf += delta;
      return;
    }
    if (e.type === "conversation.item.input_audio_transcription.done") {
      const text = (userBuf || extractText(e)).trim();
      userBuf = "";
      if (text) await persistTurn(backendClient, callId, "user", text, log);
      return;
    }

    // (C) Input item carries transcript right on creation — some builds do this
    if (e.type === "conversation.item.created" && e.item) {
      // Case 1: server emitted input_text already
      if (e.item.type === "input_text" && e.item.text) {
        const text = (e.item.text || "").trim();
        if (text) await persistTurn(backendClient, callId, "user", text, log);
        return;
      }
      // Case 2: input_audio with transcript nested
      const text = (
        e.item?.transcript?.text ??
        e.item?.transcript ??
        e.item?.content?.find?.((c: any) => c.type === "input_text")?.text ??
        ""
      ).trim();
      if (text) {
        await persistTurn(backendClient, callId, "user", text, log);
        return;
      }
    }

    // ========== ASSISTANT TRANSCRIPTS (text & TTS) ==========

    // Preferred: output text deltas
    if (e.type === "response.output_text.delta") {
      if (typeof e.delta === "string") assistantBuf += e.delta;
      return;
    }
    if (e.type === "response.output_text.done") {
      const text = assistantBuf.trim();
      assistantBuf = "";
      if (text) await persistTurn(backendClient, callId, "assistant", text, log);
      return;
    }

    // Fallback: response.completed → outputs array
    if (e.type === "response.completed" && Array.isArray(e.response?.output)) {
      const out = e.response.output;
      const text = out
        .filter((o: any) => o.type === "output_text")
        .map((o: any) => o.text?.value || "")
        .join("")
        .trim();
      if (text) await persistTurn(backendClient, callId, "assistant", text, log);
      return;
    }

    // Optional: assistant TTS transcript
    if (captureTTS && e.type === "response.audio_transcript.delta") {
      if (typeof e.delta === "string") assistantTTSBuf += e.delta;
      return;
    }
    if (captureTTS && e.type === "response.audio_transcript.done") {
      // Many sessions put full text directly as e.transcript
      const text = (assistantTTSBuf || e.transcript || "").toString().trim();
      assistantTTSBuf = "";
      if (text) await persistTurn(backendClient, callId, "assistant", text, log);
      return;
    }

    // Visibility for live debugging
    if (e.type === "error") {
      console.error("Realtime error", e);
    }
  });
}

function extractText(e: any): string {
  return (
    e?.transcript?.text ??
    e?.transcript ??
    e?.item?.transcript?.text ??
    e?.item?.transcript ??
    e?.item?.content?.find?.((c: any) => c.type === "input_text")?.text ??
    ""
  ).toString().trim();
}

async function persistTurn(
  backend: BackendClient,
  callId: string,
  role: "user" | "assistant",
  text: string,
  log: (m: string, meta?: any) => void
) {
  if (!text) return;
  log(role === "user" ? "👤 USER" : "🤖 CORA", text);
  try {
    const res: any = await backend.postEvent(callId, {
      type: "turn",
      role,
      text,
      ts: new Date().toISOString(),
    });
    if (res && res.ok === false) console.error("postEvent failed", res.status, res.error);
  } catch (err) {
    console.error("postEvent exception", err);
  }
}