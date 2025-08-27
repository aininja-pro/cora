// rt_stt_proof.js
const fs = require("fs");
const WebSocket = require("ws");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Set OPENAI_API_KEY"); process.exit(1); }

// 1) Connect Realtime
const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview";
const ws = new WebSocket(url, {
  headers: { Authorization: `Bearer ${KEY}`, "OpenAI-Beta": "realtime=v1" }
});

ws.on("open", () => {
  console.log("✅ Realtime connected");

  // 2) Turn ON user transcription (STT) + audio formats
  const sessionUpdate = {
    type: "session.update",
    session: {
      input_audio_transcription: { model: "whisper-1", language: "en" },
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: { type: "server_vad", silence_duration_ms: 300 }
    }
  };
  ws.send(JSON.stringify(sessionUpdate));
  console.log("→ session.update sent");
});

ws.on("message", (data) => {
  let evt;
  try { evt = JSON.parse(data.toString()); } catch { return; }

  if (evt.type === "session.updated") {
    console.log("✅ session.updated:", evt.session?.input_audio_transcription);

    // 3) Stream WAV → append/commit in 100ms chunks
    //    Expect 16kHz mono PCM16 WAV: skip 44-byte header
    try {
      const wav = fs.readFileSync("./test.wav");
      const headerBytes = 44;
      const pcm = wav.slice(headerBytes);

      const sampleRate = 16000;
      const bytesPerSample = 2; // PCM16
      const chunkMs = 100;
      const chunkBytes = (sampleRate * bytesPerSample * chunkMs) / 1000;

      let offset = 0;
      const sendChunk = () => {
        if (offset >= pcm.length) {
          console.log("✅ Finished streaming test.wav");
          return;
        }
        const slice = pcm.slice(offset, offset + chunkBytes);
        offset += slice.length;

        ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: slice.toString("base64") // raw PCM16 base64
        }));
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        setTimeout(sendChunk, chunkMs);
      };
      sendChunk();
    } catch (error) {
      console.log("⚠️ No test.wav found - create a 16kHz mono PCM16 WAV file");
      console.log("   Record 'this is a test' and save as test.wav");
    }
  }

  // 4) Log completed user transcripts (this is the goal)
  if (evt.type === "conversation.item.input_audio_transcription.completed") {
    console.log("📝 USER TRANSCRIPT:", evt.transcript?.text || evt.transcript);
  }

  // 5) Log errors precisely
  if (evt.type === "error") {
    console.error("❌ Realtime error:", evt);
  }
});

ws.on("close", (c) => console.log("🔌 closed", c));
ws.on("error", (e) => console.error("WS error", e));