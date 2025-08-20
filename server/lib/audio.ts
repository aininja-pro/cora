/**
 * Audio conversion utilities for Twilio <-> OpenAI Realtime
 * Handles μ-law <-> PCM16 conversion and resampling
 */

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

// μ-law to linear PCM16 conversion table
const mulawToLinear = new Array(256);
for (let i = 0; i < 256; i++) {
  let val = ~i;
  let t = ((val & 0x0F) << 3) + MULAW_BIAS;
  t <<= (val & 0x70) >> 4;
  mulawToLinear[i] = (val & 0x80) ? (MULAW_BIAS - t) : (t - MULAW_BIAS);
}

// Linear PCM16 to μ-law conversion
const linearToMulaw = new Array(65536);
for (let i = 0; i < 65536; i++) {
  const pcm = i - 32768; // Convert unsigned to signed
  const sign = (pcm < 0) ? 0x80 : 0x00;
  const magnitude = Math.abs(pcm);
  
  let exp = 7;
  for (let expMask = 0x4000; (magnitude & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}
  
  const mantissa = (magnitude >> (exp + 3)) & 0x0F;
  const mulaw = ~(sign | (exp << 4) | mantissa);
  linearToMulaw[i] = mulaw & 0xFF;
}

/**
 * Convert μ-law encoded audio to 16-bit PCM
 */
export function decodeMuLaw(mulawData: Buffer): Buffer {
  const pcmData = Buffer.alloc(mulawData.length * 2);
  
  for (let i = 0; i < mulawData.length; i++) {
    const linear = mulawToLinear[mulawData[i]];
    pcmData.writeInt16LE(linear, i * 2);
  }
  
  return pcmData;
}

/**
 * Convert 16-bit PCM to μ-law encoded audio
 */
export function encodeMuLaw(pcmData: Buffer): Buffer {
  const mulawData = Buffer.alloc(pcmData.length / 2);
  
  for (let i = 0; i < mulawData.length; i++) {
    const pcm = pcmData.readInt16LE(i * 2);
    const unsigned = pcm + 32768;
    mulawData[i] = linearToMulaw[Math.max(0, Math.min(65535, unsigned))];
  }
  
  return mulawData;
}

/**
 * CRITICAL: Band-limited resampler with proper anti-aliasing (ChatGPT spec)
 * Low-pass at ≤4kHz before decimation, prevents aliasing artifacts
 */
export function resample(input: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return input;
  
  const inputSamples = input.length / 2;
  const outputSamples = Math.floor((inputSamples * toRate) / fromRate);
  const output = Buffer.alloc(outputSamples * 2);
  
  // CRITICAL: For downsampling, apply low-pass filter at target Nyquist frequency
  let filtered = input;
  
  if (fromRate > toRate) {
    // ChatGPT spec: low-pass at ~3.6-4kHz for 8kHz output (prevents aliasing)
    const cutoffFreq = Math.min(toRate / 2 * 0.9, 4000); // 3.6kHz for 8k output
    const cutoffRatio = cutoffFreq / fromRate;
    const filterLength = 31; // Longer filter for better stopband attenuation
    const halfLength = Math.floor(filterLength / 2);
    
    filtered = Buffer.alloc(input.length);
    
    console.log(`🔧 Band-limited filter: ${fromRate}→${toRate}Hz, cutoff=${cutoffFreq}Hz, taps=${filterLength}`);
    
    for (let i = 0; i < inputSamples; i++) {
      let sum = 0;
      let weightSum = 0;
      
      for (let j = -halfLength; j <= halfLength; j++) {
        const sampleIndex = i + j;
        if (sampleIndex >= 0 && sampleIndex < inputSamples) {
          const sample = input.readInt16LE(sampleIndex * 2);
          
          // Windowed sinc filter (ideal low-pass) 
          let weight;
          if (j === 0) {
            weight = 2 * cutoffRatio;
          } else {
            const x = Math.PI * j * 2 * cutoffRatio;
            weight = Math.sin(x) / x * 2 * cutoffRatio;
            // Blackman window (better stopband than Hamming)
            const blackman = 0.42 + 0.5 * Math.cos(Math.PI * j / halfLength) + 0.08 * Math.cos(2 * Math.PI * j / halfLength);
            weight *= blackman;
          }
          
          sum += sample * weight;
          weightSum += weight;
        }
      }
      
      const filteredSample = Math.round(sum / (weightSum || 1));
      filtered.writeInt16LE(Math.max(-32768, Math.min(32767, filteredSample)), i * 2);
    }
  }
  
  // High-quality resampling with linear interpolation (sufficient for audio)
  const ratio = inputSamples / outputSamples;
  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = i * ratio;
    const srcIndexInt = Math.floor(srcIndex);
    const frac = srcIndex - srcIndexInt;
    
    const s1 = srcIndexInt < inputSamples ? filtered.readInt16LE(srcIndexInt * 2) : 0;
    const s2 = srcIndexInt + 1 < inputSamples ? filtered.readInt16LE((srcIndexInt + 1) * 2) : s1;
    
    const interpolated = Math.round(s1 + (s2 - s1) * frac);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }
  
  return output;
}

/**
 * Resample 8kHz to 16kHz (for Twilio -> OpenAI)
 */
export function resample8kTo16k(pcmData: Buffer): Buffer {
  return resample(pcmData, 8000, 16000);
}

/**
 * Resample 16kHz to 8kHz (for OpenAI -> Twilio)
 */
export function resample16kTo8k(pcmData: Buffer): Buffer {
  return resample(pcmData, 16000, 8000);
}

/**
 * Resample 8kHz to 24kHz (for Twilio -> OpenAI PCM16 default)
 */
export function resample8kTo24k(pcmData: Buffer): Buffer {
  return resample(pcmData, 8000, 24000);
}

/**
 * Resample 24kHz to 8kHz (for OpenAI default -> Twilio)
 */
export function resample24kTo8k(pcmData: Buffer): Buffer {
  return resample(pcmData, 24000, 8000);
}