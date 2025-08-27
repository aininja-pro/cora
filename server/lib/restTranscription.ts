// restTranscription.ts - REST fallback for user transcripts
export async function transcribeAndPersistUser(
  ulawBuffer: Buffer, 
  callId: string, 
  backendClient: any,
  apiKey: string
): Promise<void> {
  try {
    // Create simple WAV wrapper for μ-law data
    const wavBuffer = createMulawWav(ulawBuffer);
    
    // Create form data for OpenAI REST API
    const formData = new FormData();
    formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    
    // Call OpenAI REST transcription
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });
    
    if (response.ok) {
      const result = await response.json();
      const text = result.text?.trim();
      
      if (text) {
        console.log("👤 USER (REST)", text);
        
        // Persist via backend
        await backendClient.postEvent(callId, {
          type: "turn",
          role: "user", 
          text,
          ts: new Date().toISOString()
        });
      }
    } else {
      console.error("REST transcription failed", response.status, await response.text());
    }
  } catch (error) {
    console.error("REST transcription exception", error);
  }
}

function createMulawWav(ulawData: Buffer): Buffer {
  // Simple WAV header for μ-law data at 8kHz
  const header = Buffer.alloc(44);
  const dataSize = ulawData.length;
  const fileSize = dataSize + 36;
  
  // WAV header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(18, 16); // fmt chunk size
  header.writeUInt16LE(7, 20);  // μ-law format
  header.writeUInt16LE(1, 22);  // mono
  header.writeUInt32LE(8000, 24); // sample rate
  header.writeUInt32LE(8000, 28); // byte rate
  header.writeUInt16LE(1, 32);  // block align
  header.writeUInt16LE(8, 34);  // bits per sample
  header.writeUInt16LE(0, 36);  // extra size
  header.write('data', 38);
  header.writeUInt32LE(dataSize, 42);
  
  return Buffer.concat([header, ulawData]);
}