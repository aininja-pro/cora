const WebSocket = require('ws');
require('dotenv').config();

const apiKey = process.env.OPENAI_API_KEY;
const projectId = process.env.OPENAI_PROJECT;

console.log('🧪 Testing OpenAI Realtime API\n');
console.log('API Key:', apiKey ? apiKey.slice(0, 20) + '...' : 'MISSING');
console.log('Project ID:', projectId || 'MISSING');
console.log('');

const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview';
const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'OpenAI-Beta': 'realtime=v1',
  'OpenAI-Project': projectId
};

console.log('📡 Connecting...');
const ws = new WebSocket(url, { headers });

ws.on('open', () => {
  console.log('✅ SUCCESS! Connected to OpenAI Realtime API');
  console.log('🎉 Your API key and project ID are working!\n');
  setTimeout(() => { ws.close(); process.exit(0); }, 1000);
});

ws.on('error', (err) => {
  console.error('❌ ERROR:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ Timeout');
  process.exit(1);
}, 10000);
