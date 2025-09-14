/**
 * Audio Worker Thread - Deterministic 20ms frame pacing
 * Isolated from main thread GC to prevent audio stuttering
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (!parentPort) {
  console.error('AudioWorker must be run as a worker thread');
  process.exit(1);
}

// Worker state
let isRunning = false;
let frameCount = 0;
let startTime = null;
let intervalId = null;

// Audio metrics
let underruns = 0;
let framesSentThisSecond = 0;
let lastSecond = 0;

/**
 * Start the deterministic 20ms audio pacing loop
 */
function startAudioPacing() {
  if (isRunning) {
    parentPort.postMessage({ type: 'error', message: 'Audio pacing already running' });
    return;
  }
  
  isRunning = true;
  startTime = process.hrtime.bigint();
  frameCount = 0;
  underruns = 0;
  
  console.log('🎯 AudioWorker: Starting deterministic 20ms pacing');
  
  // Use high-precision interval (Node.js worker threads have better timing isolation)
  intervalId = setInterval(() => {
    const currentTime = process.hrtime.bigint();
    const elapsedNs = currentTime - startTime;
    const elapsedMs = Number(elapsedNs / BigInt(1000000));
    
    // Calculate expected frame count (50fps = 20ms intervals)
    const expectedFrames = Math.floor(elapsedMs / 20);
    const framesBehind = expectedFrames - frameCount;
    
    // Send frame request to main thread
    const framesToRequest = Math.min(framesBehind + 1, 3); // Max 3 frames per tick
    
    if (framesToRequest > 0) {
      parentPort.postMessage({
        type: 'frame_request',
        count: framesToRequest,
        elapsedMs: elapsedMs,
        expectedFrame: expectedFrames
      });
      
      // We'll increment frameCount when main thread confirms frame sent
    }
    
    // Metrics reporting
    const currentSecond = Math.floor(elapsedMs / 1000);
    if (currentSecond !== lastSecond) {
      parentPort.postMessage({
        type: 'metrics',
        framesSent: frameCount,
        elapsedMs: elapsedMs,
        underruns: underruns,
        fps: framesSentThisSecond
      });
      
      framesSentThisSecond = 0;
      lastSecond = currentSecond;
    }
    
  }, 10); // Check every 10ms for high precision
  
  parentPort.postMessage({ type: 'started' });
}

/**
 * Stop the audio pacing loop
 */
function stopAudioPacing() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  isRunning = false;
  
  const finalElapsed = startTime ? Number((process.hrtime.bigint() - startTime) / BigInt(1000000)) : 0;
  
  parentPort.postMessage({
    type: 'stopped',
    totalFrames: frameCount,
    totalMs: finalElapsed,
    totalUnderruns: underruns
  });
  
  console.log(`🏁 AudioWorker: Stopped after ${frameCount} frames, ${underruns} underruns`);
}

// Handle messages from main thread
parentPort.on('message', (message) => {
  switch (message.type) {
    case 'start':
      startAudioPacing();
      break;
      
    case 'stop':
      stopAudioPacing();
      break;
      
    case 'frame_sent':
      // Main thread confirms a frame was sent
      frameCount++;
      framesSentThisSecond++;
      break;
      
    case 'underrun':
      // Main thread reports an underrun
      underruns++;
      break;
      
    default:
      console.log(`AudioWorker: Unknown message type: ${message.type}`);
  }
});

// Handle worker shutdown
process.on('SIGTERM', () => {
  stopAudioPacing();
  process.exit(0);
});

console.log('🎵 AudioWorker: Ready for deterministic audio pacing');