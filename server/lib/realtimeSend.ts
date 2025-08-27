// realtimeSend.ts
export const FEEDER_TOKEN = Symbol("feeder_only");

let _ws: import("ws") | null = null;

export function bindRealtime(ws: any) {
  _ws = ws;
  console.log("SEND:BOUND ws=", (ws as any)._rtid ?? "?");
}

export function sendToOpenAI(msg: any, token?: symbol) {
  if (!_ws || _ws.readyState !== 1) {  // 1 = OPEN
    console.error("SEND:NOT-BOUND/NOT-OPEN", { hasWs: !!_ws, rs: _ws?.readyState });
    return;
  }

  const isAudioMsg =
    msg?.type === "input_audio_buffer.append" ||
    msg?.type === "input_audio_buffer.commit";

  if (isAudioMsg && token !== FEEDER_TOKEN) {
    console.warn("⛔ BLOCKED non-feeder audio msg:", msg.type);
    return; // kill the legacy pipeline
  }

  // observability: size logs
  if (msg?.type === "input_audio_buffer.append") {
    const b64 = msg.audio || msg.buffer || "";
    console.log(`→ append len=${b64.length} (expect ~4266 for 3200B)`);
  }
  if (msg?.type === "input_audio_buffer.commit") {
    console.log("→ commit (expect every ~100ms while speaking)");
  }

  _ws.send(JSON.stringify(msg));
}