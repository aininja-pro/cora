// realtimeSend.ts
export const FEEDER_TOKEN = Symbol("feeder_only");

let _ws: any; // your open Realtime WS
export function bindRealtime(ws: any) { _ws = ws; }

// Drop ALL audio messages unless they come from WhisperFeeder
export function sendToOpenAI(msg: any, token?: symbol) {
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