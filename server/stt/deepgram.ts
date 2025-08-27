import WebSocket from "ws";

type OnFinal = (text: string) => void;
type OnAnyMsg = (m: unknown) => void;

export class DeepgramSTT {
  private ws?: WebSocket;
  private ready = false;
  private sentBytes = 0;
  private msgCount = 0;

  constructor(
    private apiKey: string,
    private onFinal: OnFinal,
    private onAnyMsg?: OnAnyMsg
  ) {}

  async start() {
    const url =
      "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&smart_format=true&punctuate=true";
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });
    this.ws.on("open", () => {
      this.ready = true;
      console.log("🎙️ Deepgram: connected");
    });
    this.ws.on("message", (raw) => {
      this.msgCount++;
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type !== "results") return;           // Deepgram uses "results"
        const alts = msg.channel?.alternatives ?? [];
        const best = alts[0];
        const text = (best?.transcript || "").trim();

        // Optional: log partials to prove life
        if (text && !msg.is_final) {
          console.log("DG partial:", text);
        }

        if (text && msg.is_final) {
          console.log("🎤 Deepgram FINAL:", text);
          this.onFinal(text);
        }
      } catch {
        // ignore binary frames
      }
    });
    this.ws.on("error", (e) => console.error("Deepgram WS error:", e));
    this.ws.on("close", (c) => {
      this.ready = false;
      console.log("🔌 Deepgram closed:", c);
    });
  }

  /** Twilio sends base64 μ-law (160 bytes per 20ms). Send RAW bytes, not base64 text. */
  sendMulawBase64(b64: string) {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const buf = Buffer.from(b64, "base64");
    this.sentBytes += buf.length;
    this.ws.send(buf, { binary: true }, (err) => {
      if (err) console.error("Deepgram send error:", err);
    });
  }

  stats() {
    return { sentBytes: this.sentBytes, msgCount: this.msgCount };
  }

  async stop() {
    try { this.ws?.close(); } catch {}
    this.ready = false;
  }
}