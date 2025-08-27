// tracer.ts
export function wireRealtimeTracer(ws: import("ws")) {
  console.log("📝 TRANSCRIPT PERSISTENCE WIRED (tracer on)");
  let seen = 0;
  ws.on("message", (raw: Buffer) => {
    if (seen > 50) return; // keep logs sane
    try {
      const e = JSON.parse(raw.toString());
      if (!e?.type) return;
      seen++;
      console.log("EVT", e.type);
      // log a tiny sample of likely text carriers
      if (e.type === "conversation.item.input_audio_transcription.completed") {
        console.log("EVT SAMPLE (user completed):", JSON.stringify(e).slice(0, 220));
      }
      if (e.type === "conversation.item.created" && e.item?.type === "input_audio") {
        console.log("EVT SAMPLE (user created):", JSON.stringify(e).slice(0, 220));
      }
      if (e.type === "response.completed" || e.type === "response.output_text.done" || e.type === "response.audio_transcript.done") {
        console.log("EVT SAMPLE (assistant):", JSON.stringify(e).slice(0, 220));
      }
    } catch {}
  });
}