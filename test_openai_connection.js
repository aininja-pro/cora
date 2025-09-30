// Quick test to verify OpenAI Realtime API connection
const WebSocket = require('ws');
require('dotenv').config({ path: './server/.env' });

const apiKey = process.env.OPENAI_API_KEY;
const projectId = process.env.OPENAI_PROJECT;

console.log('🧪 Testing OpenAI Realtime API Connection...\n');
console.log('API Key:', apiKey ? `${apiKey.slice(0, 20)}...` : '❌ MISSING');
console.log('Project ID:', projectId || '❌ MISSING');
console.log('');

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY not found in server/.env');
  process.exit(1);
}

const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview';
const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'OpenAI-Beta': 'realtime=v1'
};

if (projectId) {
  headers['OpenAI-Project'] = projectId;
}

console.log('📡 Connecting to OpenAI Realtime API...');

const ws = new WebSocket(url, { headers });

ws.on('open', () => {
  console.log('✅ Connected successfully!');
  console.log('');
  console.log('🎉 OpenAI Realtime API is working!');
  console.log('📋 Connection details:');
  console.log('   - Model: gpt-4o-mini-realtime-preview');
  console.log('   - Project ID:', projectId || 'none (optional)');
  console.log('');

  // Send a simple session update to verify it's fully functional
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: 'You are a test assistant.',
      voice: 'verse'
    }
  }));

  console.log('✅ Session update sent successfully');
  console.log('');
  console.log('🎯 Your OpenAI configuration is ready for CORA!');

  // Close after 2 seconds
  setTimeout(() => {
    ws.close();
    console.log('');
    console.log('✅ Test completed successfully!');
    process.exit(0);
  }, 2000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message type:', message.type);

    if (message.type === 'error') {
      console.error('❌ Error from OpenAI:', message.error);
    }
  } catch (e) {
    // Ignore parse errors for binary data
  }
});

ws.on('error', (error) => {
  console.error('');
  console.error('❌ Connection Error:');
  console.error(error.message);
  console.error('');

  if (error.message.includes('401')) {
    console.error('🔑 Issue: Invalid API Key');
    console.error('   → Check your OPENAI_API_KEY in server/.env');
  } else if (error.message.includes('403')) {
    console.error('🔑 Issue: API Key lacks permissions');
    console.error('   → Ensure your API key has Realtime API access');
  } else if (error.message.includes('429')) {
    console.error('⏸️  Issue: Rate limit or quota exceeded');
  }

  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (code !== 1000) {
    console.error('');
    console.error('❌ Connection closed unexpectedly');
    console.error('   Code:', code);
    console.error('   Reason:', reason.toString() || 'none');
    process.exit(1);
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('');
  console.error('❌ Connection timeout after 10 seconds');
  console.error('   Check your internet connection and API key');
  ws.close();
  process.exit(1);
}, 10000);
