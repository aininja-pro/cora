// whisperFeeder.ts
// Twilio inbound μ-law (8 kHz, 20 ms = 160 bytes) -> PCM16 16 kHz -> 100 ms commits (3200 bytes)
import { sendToOpenAI, FEEDER_TOKEN } from "./realtimeSend";
import { transcribeAndPersistUser } from "./restTranscription";

type SendFn = (msg: any) => void;

// === Tunables (optimized for phone speech - ChatGPT Step 4) ===
const MIN_UTTER_MS = 600;   // was 800
const END_SIL_MS   = 220;   // was 300 (phone speech often has ~200–250ms gaps)
const HARD_MAX_MS  = 3000;  // was 4500

export class WhisperFeeder {
  private byteBuf = Buffer.alloc(0); // μ-law bytes @ 8 kHz
  private ready = false;
  private lastSpeechAt = 0;          // ms timestamp of last voiced frame
  private startedAt = 0;             // ms timestamp when current utterance began
  private clock = () => Date.now();

  constructor(
    private send: (m:any, t?:symbol) => void,
    private callId?: string,
    private backendClient?: any,
    private apiKey?: string
  ) {}

  markReady() { this.ready = true; }  // call after session.updated

  /** Call this for EACH Twilio media frame with track === "inbound" */
  onInboundMulawBase64(b64: string) {
    if (!this.ready) return;

    // accumulate raw μ-law frames into one big Buffer per utterance (ChatGPT Step 2)
    const ulaw = Buffer.from(b64, "base64");
    
    // energy check on μ-law frame (simpler - check for non-silence)
    const isVoiced = this.frameHasSpeechMulaw(ulaw);

    // start timing on first voiced frame
    const now = this.clock();
    if (this.byteBuf.length === 0 && isVoiced) this.startedAt = now;
    if (isVoiced) this.lastSpeechAt = now;

    // always append the μ-law frame
    this.byteBuf = Buffer.concat([this.byteBuf, ulaw]);

    // compute utterance age + trailing silence (μ-law timing)
    const bufMs = Math.floor(this.byteBuf.length / 8); // 8 μ-law bytes = 1ms @ 8kHz
    const sinceVoice = now - this.lastSpeechAt;

    // commit only when:
    //  A) we've got enough speech (≥ MIN_UTTER_MS) AND trailing silence (≥ END_SIL_MS), OR
    //  B) we hit HARD_MAX_MS (safety valve)
    const utterMs = now - this.startedAt;
    const shouldCommit =
      (utterMs >= MIN_UTTER_MS && sinceVoice >= END_SIL_MS) ||
      utterMs >= HARD_MAX_MS;

    if (shouldCommit && this.byteBuf.length > 0) {
      // one append with the whole utterance, then one commit
      const b64All = this.byteBuf.toString("base64");
      this.send({ type: "input_audio_buffer.append", audio: b64All }, FEEDER_TOKEN);
      this.send({ type: "input_audio_buffer.commit" }, FEEDER_TOKEN);

      // observability
      console.log(`→ append utterance lenB=${this.byteBuf.length} (~${bufMs} ms μ-law)`);
      console.log("→ commit (utterance)");

      // REST fallback transcription (ChatGPT Step 4)
      if (this.callId && this.backendClient && this.apiKey) {
        transcribeAndPersistUser(this.byteBuf, this.callId, this.backendClient, this.apiKey)
          .catch(err => console.error("REST transcription failed", err));
      }

      // reset
      this.byteBuf = Buffer.alloc(0);
      this.startedAt = 0;
      this.lastSpeechAt = 0;
    }
  }

  flushAndStop() {
    if (this.byteBuf.length > 0) {
      const b64All = this.byteBuf.toString("base64");
      this.send({ type:"input_audio_buffer.append", audio: b64All }, FEEDER_TOKEN);
      this.send({ type:"input_audio_buffer.commit" }, FEEDER_TOKEN);
      console.log(`→ flush final lenB=${this.byteBuf.length}`);
      this.byteBuf = Buffer.alloc(0);
    }
  }

  // ---- low-level helpers ----
  private appendAndCommit(pcm16Bytes: Buffer) {
    sendToOpenAI({
      type: "input_audio_buffer.append",
      audio: pcm16Bytes.toString("base64")
    }, FEEDER_TOKEN);

    sendToOpenAI({ type: "input_audio_buffer.commit" }, FEEDER_TOKEN);
  }

  private decodeMulawToPCM16(ulaw: Buffer): Int16Array {
    // μ-law decode lookup table
    const table = WhisperFeeder.MULAW_TABLE;
    const out = new Int16Array(ulaw.length);
    for (let i = 0; i < ulaw.length; i++) out[i] = table[ulaw[i]];
    return out;
  }

  private upsample8kTo16kLinear(in8k: Int16Array): Int16Array {
    // Simple linear interpolation (2x)
    const n = in8k.length;
    if (n === 0) return new Int16Array(0);
    const out = new Int16Array(n * 2);
    for (let i = 0; i < n - 1; i++) {
      const s0 = in8k[i];
      const s1 = in8k[i + 1];
      out[2 * i] = s0;
      out[2 * i + 1] = (s0 + s1) >> 1; // average
    }
    // last sample duplicate
    const last = in8k[n - 1];
    out[2 * (n - 1)] = last;
    out[2 * (n - 1) + 1] = last;
    return out;
  }

  private frameHasSpeechMulaw(ulaw: Buffer): boolean {
    // simple energy gate for μ-law: voiced if >5% samples differ from silence (0xFF)
    let voiced = 0;
    for (let i = 0; i < ulaw.length; i++) {
      const sample = ulaw[i];
      // μ-law silence is 0xFF; consider voiced if significantly different
      if (sample < 0xF0 || sample > 0xFF) voiced++;
    }
    return (voiced / ulaw.length) > 0.05;
  }

  // Standard μ-law decode table (256 entries)
  static MULAW_TABLE = (() => {
    const t = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      let u = (~i) & 0xff;
      let sign = (u & 0x80) ? -1 : 1;
      let exponent = (u >> 4) & 0x07;
      let mantissa = u & 0x0f;
      let sample = ((mantissa << 3) + 0x84) << exponent;
      t[i] = sign * (sample - 0x84);
    }
    return t;
  })();
}