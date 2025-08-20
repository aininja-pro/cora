/**
 * Rate probe utility to determine OpenAI's PCM16 sample rate expectation
 * ChatGPT's diagnostic step 2
 */
import { WebSocket } from 'ws';

export function generatePCM16Tone(durationMs: number, sampleRate: number, frequency: number = 1000): Buffer {
  const samples = Math.floor(durationMs * sampleRate / 1000);
  const buffer = Buffer.alloc(samples * 2); // Int16 = 2 bytes per sample
  
  for (let i = 0; i < samples; i++) {
    // Generate sine wave at specified frequency
    const t = i / sampleRate;
    const amplitude = Math.round(32767 * 0.25 * Math.sin(2 * Math.PI * frequency * t));
    buffer.writeInt16LE(amplitude, i * 2);
  }
  
  return buffer;
}

export async function probeOpenAIRate(ws: WebSocket): Promise<void> {
  console.log('🔬 RATE PROBE: Testing OpenAI\'s PCM16 sample rate expectation...');
  
  // Test different rates to see which one reports closest to 200ms
  const testRates = [16000, 24000, 48000];
  
  for (const rate of testRates) {
    console.log(`🧪 Testing ${rate}Hz: generating 200ms of audio...`);
    
    // Generate 200ms of 1kHz tone at test rate
    const tonePCM16 = generatePCM16Tone(200, rate, 1000);
    const toneBase64 = tonePCM16.toString('base64');
    
    console.log(`📏 Generated: ${tonePCM16.length} bytes (${tonePCM16.length / 2} samples @ ${rate}Hz)`);
    console.log(`🔍 First 16 bytes: ${tonePCM16.subarray(0, 16).toString('hex')}`);
    
    // Send to OpenAI and wait for server_vad to commit
    ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: toneBase64
    }));
    
    console.log(`📡 Sent ${rate}Hz tone - watch for commit duration in errors...`);
    
    // Wait a moment before next test
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('🔬 RATE PROBE COMPLETE: Check error logs to see which rate OpenAI counted as ~200ms');
}