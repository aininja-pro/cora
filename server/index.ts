import express from 'express';
import cors from 'cors';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import sessionRouter from './routes/session';
import twilioRouter from './routes/twilio';
import toolsRouter from './routes/tools';
import { handleMediaStream } from './ws/mediaBridge';

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

// WebSocket handler for Twilio media streams
wss.on('connection', (ws, req) => {
  if (req.url?.startsWith('/media-stream')) {
    handleMediaStream(ws, req);
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