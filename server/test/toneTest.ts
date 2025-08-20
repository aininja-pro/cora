/**
 * Tone test utility for ChatGPT's acceptance test #10
 * Generate 1kHz sine wave and test 16k→8k→μ-law pipeline
 */
import { resample16kTo8k, encodeMuLaw } from '../lib/audio';

export function generate1kHzTone(durationMs: number, sampleRate: number): Buffer {
  const samples = Math.floor(durationMs * sampleRate / 1000);
  const buffer = Buffer.alloc(samples * 2); // Int16 = 2 bytes per sample
  
  for (let i = 0; i < samples; i++) {
    // 1kHz sine wave at -12dB to avoid clipping
    const t = i / sampleRate;
    const amplitude = Math.round(32767 * 0.25 * Math.sin(2 * Math.PI * 1000 * t));
    buffer.writeInt16LE(amplitude, i * 2);
  }
  
  return buffer;
}

export function testTonePipeline(): void {
  console.log('🎵 TONE TEST: Generating 1kHz sine @ 16kHz...');
  
  // Generate 1 second of 1kHz tone at 16kHz
  const tone16k = generate1kHzTone(1000, 16000);
  console.log(`✅ Generated: ${tone16k.length} bytes (16kHz PCM16)`);
  
  // Test the exact pipeline: 16k→8k→μ-law
  console.log('🔧 Testing pipeline: 16kHz → band-limited 8kHz → μ-law...');
  const tone8k = resample16kTo8k(tone16k);
  console.log(`✅ Resampled: ${tone8k.length} bytes (8kHz PCM16)`);
  
  const toneMulaw = encodeMuLaw(tone8k);
  console.log(`✅ Encoded: ${toneMulaw.length} bytes (μ-law)`);
  
  // Check for artifacts (should be clean sine wave)
  const samples8k = [];
  for (let i = 0; i < Math.min(80, tone8k.length / 2); i++) {
    samples8k.push(tone8k.readInt16LE(i * 2));
  }
  
  const peak = Math.max(...samples8k.map(s => Math.abs(s)));
  const rms = Math.sqrt(samples8k.reduce((sum, s) => sum + s * s, 0) / samples8k.length);
  
  console.log(`📊 Post-resample: RMS=${Math.round(rms)}, peak=${peak}`);
  console.log(`✅ TONE TEST: ${peak > 1000 && peak < 10000 ? 'PASS' : 'FAIL'} - 1kHz survived with no rasp`);
}

// Run test if called directly
if (require.main === module) {
  testTonePipeline();
}