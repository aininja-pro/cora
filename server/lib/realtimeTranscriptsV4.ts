// realtimeTranscriptsV4.ts
type BackendClient = {
  postEvent: (callId: string, evt: {
    type: "turn",
    role: "user" | "assistant",
    text: string,
    ts: string
  }) => Promise<{ ok: boolean; status?: number; error?: any } | void>;
};

// Buffer transcripts until backendClient exists (ChatGPT Step 2)
const backlog: {callId:string; role:"user"|"assistant"; text:string; ts:string}[] = [];

export function wireRealtimeTranscriptPersistenceV4(opts: {
  ws: import("ws");
  callId: string;
  backendClient: BackendClient;
  captureTTS?: boolean;
}) {
  const { ws, callId, backendClient, captureTTS = true } = opts;
  console.log("📝 TRANSCRIPT PERSISTENCE WIRED (V4)");

  let userBuf = "";
  let asstBuf = "";
  let asstTTSBuf = "";

  ws.on("message", async (raw: Buffer) => {
    let e: any; try { e = JSON.parse(raw.toString()); } catch { return; }

    // ---------- USER: primary (completed) ----------
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      const text = extractText(e);
      if (text) { await persist(backendClient, callId, "user", text); userBuf = ""; }
      return;
    }
    // ---------- USER: streaming (delta/done) ----------
    if (e.type === "conversation.item.input_audio_transcription.delta") {
      if (e.delta) userBuf += String(e.delta);
      return;
    }
    if (e.type === "conversation.item.input_audio_transcription.done") {
      const text = (userBuf || extractText(e)).trim();
      userBuf = "";
      if (text) { await persist(backendClient, callId, "user", text); }
      return;
    }
    // ---------- USER: item carries transcript on create/update/completed ----------
    if (
      (e.type === "conversation.item.created" ||
       e.type === "conversation.item.updated" ||
       e.type === "conversation.item.completed") && e.item
    ) {
      // input_text directly
      if (e.item.type === "input_text" && e.item.text) {
        const text = String(e.item.text).trim();
        if (text) { await persist(backendClient, callId, "user", text); }
        return;
      }
      // input_audio with transcript nested
      const text =
        pick(e.item, ["transcript.text","transcript"]) ||
        pickFromArray(e.item?.content, "input_text", "text") ||
        "";
      if (text.trim()) { await persist(backendClient, callId, "user", text.trim()); }
      // don't return; continue to assistant checks in same tick
    }

    // ---------- ASSISTANT: text stream ----------
    if (e.type === "response.output_text.delta") {
      if (typeof e.delta === "string") asstBuf += e.delta;
      return;
    }
    if (e.type === "response.output_text.done") {
      const text = asstBuf.trim(); asstBuf = "";
      if (text) { await persist(backendClient, callId, "assistant", text); }
      return;
    }
    // ---------- ASSISTANT: outputs array fallback ----------
    if (e.type === "response.completed" && Array.isArray(e.response?.output)) {
      const text = e.response.output
        .filter((o: any) => o.type === "output_text")
        .map((o: any) => o.text?.value || "")
        .join("")
        .trim();
      if (text) { await persist(backendClient, callId, "assistant", text); }
      return;
    }
    // ---------- ASSISTANT TTS transcript (you already saw this) ----------
    if (captureTTS && e.type === "response.audio_transcript.delta") {
      if (typeof e.delta === "string") asstTTSBuf += e.delta;
      return;
    }
    if (captureTTS && e.type === "response.audio_transcript.done") {
      const text = (asstTTSBuf || e.transcript || "").toString().trim(); asstTTSBuf = "";
      if (text) { await persist(backendClient, callId, "assistant", text); }
      return;
    }

    // Log raw errors for visibility
    if (e.type === "error") console.error("RT error:", e);
  });
}

function extractText(e: any): string {
  return (
    e?.transcript?.text ??
    e?.transcript ??
    e?.item?.transcript?.text ??
    e?.item?.transcript ??
    pickFromArray(e?.item?.content, "input_text", "text") ??
    ""
  )?.toString() ?? "";
}

function pick(obj: any, paths: string[]): string | undefined {
  for (const p of paths) {
    const v = p.split(".").reduce((o,k)=> (o && o[k]!==undefined ? o[k] : undefined), obj);
    if (typeof v === "string" && v.trim()) return v;
  }
}

function pickFromArray(arr: any[], type: string, key: string): string | undefined {
  if (!Array.isArray(arr)) return;
  for (const it of arr) {
    if (it?.type === type && typeof it[key] === "string" && it[key].trim()) return it[key];
  }
}

async function persist(
  backend: BackendClient,
  callId: string,
  role: "user" | "assistant",
  text: string
) {
  console.log(role === "user" ? "👤 USER" : "🤖 CORA", text);
  
  const row = { callId, role, text, ts: new Date().toISOString() };

  if (!backend) {
    backlog.push(row); // buffer
    console.warn("TRANSCRIPT BACKLOG +1 (no backendClient yet)");
    return;
  }
  
  try {
    const res: any = await backend.postEvent(callId, {
      type: "turn", role, text, ts: row.ts
    });
    if (res && !res.ok) console.error("postEvent failed", res.status, res.body?.slice?.(0,200));
  } catch (err) {
    console.error("postEvent exception", err);
  }
}

// Export flush function for use after backend client is ready
export function flushTranscriptBacklog(session: any) {
  if (backlog.length && session.backendClient) {
    console.log(`FLUSHING ${backlog.length} transcript rows`);
    for (const b of backlog.splice(0)) {
      session.backendClient.postEvent(b.callId, {
        type:"turn", role:b.role, text:b.text, ts:b.ts
      }).catch((err: any) => console.error("Backlog flush failed", err));
    }
  }
}