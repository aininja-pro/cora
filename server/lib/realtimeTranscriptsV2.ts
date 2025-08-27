// realtimeTranscriptsV2.ts
type BackendClient = {
  postEvent: (callId: string, evt: {
    type: "turn",
    role: "user" | "assistant",
    text: string,
    ts: string
  }) => Promise<{ ok: boolean, status?: number, error?: any } | void>;
};

export function wireRealtimeTranscriptPersistenceV2(opts: {
  ws: import("ws");
  callId: string;
  backendClient: BackendClient;
  captureTTS?: boolean;
}) {
  const { ws, callId, backendClient, captureTTS = false } = opts;

  console.log("📝 TRANSCRIPT PERSISTENCE WIRED (handler on)");

  let assistantBuf = "";
  let assistantTTSBuf = "";

  ws.on("message", async (raw: Buffer) => {
    let e: any;
    try { e = JSON.parse(raw.toString()); } catch { return; }

    // ---- USER (primary path) ----
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      const text =
        (e.transcript?.text ?? e.transcript ?? e.item?.transcript?.text ?? e.item?.transcript ?? "").trim();
      if (text) await persistTurn(backendClient, callId, "user", text);
      return;
    }

    // ---- USER (fallback path some sessions use) ----
    if (e.type === "conversation.item.created" && e.item?.type === "input_audio") {
      const text = (e.item?.transcript?.text ?? e.item?.transcript ?? "").trim();
      if (text) await persistTurn(backendClient, callId, "user", text);
      return;
    }

    // ---- ASSISTANT (preferred text stream) ----
    if (e.type === "response.output_text.delta") {
      if (typeof e.delta === "string") assistantBuf += e.delta;
      return;
    }
    if (e.type === "response.output_text.done") {
      const text = assistantBuf.trim();
      assistantBuf = "";
      if (text) await persistTurn(backendClient, callId, "assistant", text);
      return;
    }

    // ---- ASSISTANT (fallback to response.completed outputs array) ----
    if (e.type === "response.completed" && Array.isArray(e.response?.output)) {
      const out = e.response.output;
      const text = out
        .filter((o: any) => o.type === "output_text")
        .map((o: any) => o.text?.value || "")
        .join("")
        .trim();
      if (text) await persistTurn(backendClient, callId, "assistant", text);
      return;
    }

    // ---- ASSISTANT (TTS transcript, if you want it) ----
    if (captureTTS && e.type === "response.audio_transcript.delta") {
      if (typeof e.delta === "string") assistantTTSBuf += e.delta;
      return;
    }
    if (captureTTS && e.type === "response.audio_transcript.done") {
      const text = assistantTTSBuf.trim();
      assistantTTSBuf = "";
      if (text) await persistTurn(backendClient, callId, "assistant", text);
      return;
    }

    // Optional: inspect other shapes once
    if (e.type?.startsWith("conversation.item.") || e.type?.startsWith("response.")) {
      // console.log("UNHANDLED EVT", e.type);
    }
  });
}

async function persistTurn(
  backendClient: BackendClient,
  callId: string,
  role: "user" | "assistant",
  text: string
) {
  console.log(role === "user" ? "👤 USER" : "🤖 CORA", text);
  try {
    const res: any = await backendClient.postEvent(callId, {
      type: "turn",
      role,
      text,
      ts: new Date().toISOString(),
    });
    if (res && res.ok === false) {
      console.error("postEvent failed", res.status, res.error);
    }
  } catch (err) {
    console.error("postEvent exception", err);
  }
}