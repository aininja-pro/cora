import express from 'express';
import cors from 'cors';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import sessionRouter from './routes/session';
import twilioRouter from './routes/twilio';
import toolsRouter from './routes/tools';
import { handleMediaStream } from './ws/mediaBridge';
import { handleVoiceAssistant } from './ws/voiceAssistant';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/session', sessionRouter);
app.use('/twilio', twilioRouter);
app.use('/api/tools', toolsRouter);

// Static files for demo client (serve CSS, JS files)
app.use('/client', express.static(path.join(__dirname, '../client')));

// Serve demo client at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Call cleanup endpoint for Twilio status callbacks
app.post('/cleanup-call', (req, res) => {
  const { callSid, reason, duration } = req.body;
  
  console.log(`🧹 Cleanup request: CallSid=${callSid}, reason=${reason}, duration=${duration}s`);
  
  // Import and call the cleanup function
  const { cleanupCall } = require('./ws/mediaBridge');
  
  try {
    cleanupCall(callSid, reason);
    console.log(`✅ Call cleanup completed for ${callSid}`);
    res.json({ ok: true, message: 'Cleanup triggered' });
  } catch (error) {
    console.error(`❌ Call cleanup failed for ${callSid}:`, error);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// Twilio status callback endpoint - triggers call cleanup
app.post('/twilio/status', express.urlencoded({ extended: true }), (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;
  
  console.log(`📞 Twilio status: CallSid=${CallSid}, Status=${CallStatus}, Duration=${CallDuration}s`);
  
  if (CallStatus === 'completed') {
    console.log(`✅ Call ${CallSid} completed, triggering cleanup...`);
    
    // Import and call the cleanup function directly
    const { cleanupCall } = require('./ws/mediaBridge');
    
    try {
      cleanupCall(CallSid, 'status-callback');
      console.log(`✅ Call cleanup completed for ${CallSid} via status callback`);
    } catch (error) {
      console.error(`❌ Call cleanup failed for ${CallSid}:`, error);
    }
  }
  
  // Always return 200 OK to Twilio
  res.status(200).send('OK');
});

// Debug route to check paths
app.get('/debug-paths', (req, res) => {
  const clientPath = path.join(__dirname, '../client');
  const fs = require('fs');
  res.json({
    __dirname,
    clientPath,
    filesExist: {
      'index.html': fs.existsSync(path.join(clientPath, 'index.html')),
      'realtime.js': fs.existsSync(path.join(clientPath, 'realtime.js'))
    }
  });
});

// WebSocket handlers
wss.on('connection', (ws, req) => {
  if (req.url?.startsWith('/media-stream')) {
    handleMediaStream(ws, req);
  } else if (req.url === '/ws/voice-assistant') {
    handleVoiceAssistant(ws, req);
  } else {
    ws.close(1002, 'Unsupported WebSocket endpoint');
  }
});

server.listen(PORT, () => {
  console.log(`🎯 CORA Realtime Voice Server running on port ${PORT}`);
  console.log(`📞 Twilio webhook: ${process.env.PUBLIC_URL}/twilio/voice`);
  console.log(`🌐 WebSocket: ${process.env.PUBLIC_URL}/media-stream`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});