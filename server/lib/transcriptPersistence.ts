// transcriptPersistence.ts
import type { CallCtx } from "./callCtx";

export function wireTranscriptPersistence(ws: import("ws"), ctx: CallCtx, opts?: { captureTTS?: boolean }) {
  console.log("📝 TRANSCRIPT PERSISTENCE WIRED (CTX)");
  const captureTTS = opts?.captureTTS ?? true;

  let userBuf = "";
  let asstBuf = "";
  let asstTTSBuf = "";

  let tapCount = 0;
  ws.on("message", async (raw: Buffer) => {
    if (tapCount < 20) {
      try { const e = JSON.parse(raw.toString()); console.log("PERSIST EVT", ++tapCount, e.type); }
      catch {}
    }
    
    let e: any; try { e = JSON.parse(raw.toString()); } catch { return; }

    // ---- USER (several shapes) ----
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      const text = extractUser(e);
      if (text) await persist(ctx, "user", text);
      userBuf = "";
      return;
    }
    if (e.type === "conversation.item.input_audio_transcription.delta") {
      if (e.delta) userBuf += String(e.delta);
      return;
    }
    if (e.type === "conversation.item.input_audio_transcription.done") {
      const text = (userBuf || extractUser(e)).trim();
      userBuf = "";
      if (text) await persist(ctx, "user", text);
      return;
    }
    if ((e.type === "conversation.item.created" || e.type === "conversation.item.updated" || e.type === "conversation.item.completed") && e.item) {
      // input_text
      if (e.item.type === "input_text" && e.item.text) {
        const text = String(e.item.text).trim();
        if (text) await persist(ctx, "user", text);
        return;
      }
      // input_audio w/ transcript nested
      const text = extractUser({ item: e.item });
      if (text) { await persist(ctx, "user", text); return; }
    }

    // ---- ASSISTANT (text) ----
    if (e.type === "response.output_text.delta") {
      if (typeof e.delta === "string") asstBuf += e.delta;
      return;
    }
    if (e.type === "response.output_text.done") {
      const text = asstBuf.trim(); asstBuf = "";
      if (text) await persist(ctx, "assistant", text);
      return;
    }
    if (e.type === "response.completed" && Array.isArray(e.response?.output)) {
      const text = e.response.output
        .filter((o: any) => o.type === "output_text")
        .map((o: any) => o.text?.value || "")
        .join("")
        .trim();
      if (text) await persist(ctx, "assistant", text);
      return;
    }

    // ---- ASSISTANT (TTS transcript) ----
    if (captureTTS && e.type === "response.audio_transcript.delta") {
      if (typeof e.delta === "string") asstTTSBuf += e.delta;
      return;
    }
    if (captureTTS && e.type === "response.audio_transcript.done") {
      const text = (asstTTSBuf || e.transcript || "").toString().trim(); asstTTSBuf = "";
      if (text) await persist(ctx, "assistant", text);
      return;
    }

    if (e.type === "error") console.error("RT error:", e);
  });
}

function extractUser(e: any): string {
  return (
    e?.transcript?.text ??
    e?.transcript ??
    e?.item?.transcript?.text ??
    e?.item?.transcript ??
    e?.item?.content?.find?.((c: any) => c.type === "input_text")?.text ??
    ""
  )?.toString().trim();
}

async function persist(ctx: CallCtx, role: "user" | "assistant", text: string) {
  if (!text) return;
  const row = { role, text, ts: new Date().toISOString() };

  if (!ctx.backendClient) {
    ctx.backlog.push(row);
    console.warn("TRANSCRIPT BACKLOG +1 (no backendClient yet)");
    return;
  }

  try {
    const r = await ctx.backendClient.postEvent(ctx.callId, {
      type: "turn", role, text, ts: row.ts,
    });
    if (!r.ok) console.error("postEvent failed", r.status, r.body?.slice?.(0,200));
  } catch (err) {
    console.error("postEvent exception", err);
  }
}

export async function flushBacklog(ctx: CallCtx) {
  if (!ctx.backendClient || ctx.backlog.length === 0) return;
  console.log(`FLUSHING ${ctx.backlog.length} transcript rows`);
  const rows = ctx.backlog.splice(0);
  for (const b of rows) {
    try {
      await ctx.backendClient.postEvent(ctx.callId, {
        type: "turn", role: b.role, text: b.text, ts: b.ts
      });
    } catch (err) {
      console.error("postEvent flush exception", err);
    }
  }
}