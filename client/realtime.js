/**
 * WebRTC Realtime Client for CORA with Tool Proxy Pattern
 * Handles WebRTC connection to OpenAI Realtime API and proxies tool calls to server
 */

console.log('🔧 CORA Realtime Client loaded');

class CoraRealtimeClient {
    constructor() {
        this.pc = null;
        this.dataChannel = null;
        this.isConnected = false;
        this.transcript = [];
        this.currentResponse = '';
        this.currentTranscript = '';
        this.toolToken = null;
        this.toolCallAccumulator = new Map(); // call_id -> { name, chunks }
        
        // UI elements
        this.statusEl = document.getElementById('status');
        this.connectBtn = document.getElementById('connectBtn');
        this.transcriptEl = document.getElementById('transcript');
        this.agentInfoEl = document.getElementById('agentInfo');
        this.agentNameEl = document.getElementById('agentName');
        this.brandNameEl = document.getElementById('brandName');
    }
    
    async connect() {
        try {
            console.log('🔄 Starting connection...');
            this.updateStatus('connecting', 'Connecting to CORA...');
            this.connectBtn.disabled = true;
            
            // Get ephemeral session and tool token from our server
            console.log('📡 Fetching session...');
            const response = await fetch('/session');
            const { success, session, tenant, toolToken, error } = await response.json();
            console.log('✅ Session response:', { success, hasSession: !!session, hasToken: !!toolToken });
            
            if (!success) {
                throw new Error(error || 'Failed to create session');
            }
            
            // Store tool token for secure tool execution
            this.toolToken = toolToken;
            
            // Update agent info
            if (tenant) {
                this.agentNameEl.textContent = tenant.agentName;
                this.brandNameEl.textContent = tenant.brandName;
                this.agentInfoEl.style.display = 'block';
            }
            
            // Create WebRTC peer connection
            this.pc = new RTCPeerConnection();
            
            // Add microphone track
            console.log('🎤 Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 24000
                }
            });
            console.log('✅ Got microphone stream');
            
            this.pc.addTrack(stream.getTracks()[0]);
            
            // Set up data channel for realtime events and tool proxying
            this.dataChannel = this.pc.createDataChannel('oai-events');
            
            this.dataChannel.addEventListener('open', () => {
                console.log('✅ Data channel opened');
                // Send session update after data channel is ready (ChatGPT's fix)
                console.log('📡 Sending session update for transcription...');
                this.dataChannel.send(JSON.stringify({
                    type: "session.update",
                    session: {
                        modalities: ["audio", "text"],
                        turn_detection: { 
                            type: "server_vad",
                            prefix_padding_ms: 250, 
                            silence_duration_ms: 200 
                        },
                        input_audio_transcription: { model: "whisper-1" }
                    }
                }));
                console.log('✅ Session update sent');
            });
            
            this.dataChannel.addEventListener('message', (event) => {
                try {
                    const realtimeEvent = JSON.parse(event.data);
                    this.handleRealtimeEvent(realtimeEvent);
                } catch (error) {
                    console.error('Error parsing realtime event:', error);
                }
            });
            
            // Handle incoming audio
            this.pc.addEventListener('track', (event) => {
                const audioElement = document.createElement('audio');
                audioElement.srcObject = event.streams[0];
                audioElement.autoplay = true;
                document.body.appendChild(audioElement);
            });
            
            // Create offer and connect to OpenAI
            console.log('🚀 Creating WebRTC offer...');
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            console.log('✅ Local description set');
            
            console.log('📡 Connecting to OpenAI Realtime API...');
            const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview`, {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${session.client_secret.value}`,
                    'Content-Type': 'application/sdp'
                }
            });
            
            console.log('📡 OpenAI response status:', sdpResponse.status);
            if (!sdpResponse.ok) {
                const errorText = await sdpResponse.text();
                console.error('❌ OpenAI error:', errorText);
                throw new Error(`Failed to connect: ${sdpResponse.status} - ${errorText}`);
            }
            
            const answerSdp = await sdpResponse.text();
            console.log('✅ Got answer SDP from OpenAI');
            await this.pc.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });
            console.log('✅ Remote description set');
            
            this.isConnected = true;
            this.updateStatus('connected', 'Connected to CORA - Start talking!');
            this.connectBtn.textContent = 'Disconnect';
            this.connectBtn.disabled = false;
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.updateStatus('disconnected', `Failed to connect: ${error.message}`);
            this.connectBtn.disabled = false;
        }
    }
    
    async handleToolCall(event) {
        const callId = event.call_id;
        const toolName = event.name;
        
        // Get accumulated arguments
        const acc = this.toolCallAccumulator.get(callId) || { name: toolName, chunks: [] };
        const argsString = acc.chunks.join('') || event.arguments || '{}';
        this.toolCallAccumulator.delete(callId);
        
        // Show tool call in transcript
        try {
            const args = JSON.parse(argsString);
            let toolMessage = '';
            
            switch(toolName) {
                case 'search_properties':
                    toolMessage = `🔍 Searching for properties in ${args.city || 'your area'}...`;
                    break;
                case 'book_showing':
                    toolMessage = `📅 Booking a showing for property ${args.propertyId}...`;
                    break;
                case 'qualify_lead':
                    toolMessage = `📋 Qualifying your real estate needs...`;
                    break;
                case 'request_callback':
                    toolMessage = `📞 Scheduling a callback to ${args.phone || 'your number'}...`;
                    break;
                case 'transfer_to_human':
                    toolMessage = `👤 Transferring you to a human agent...`;
                    break;
                default:
                    toolMessage = `🔧 Processing ${toolName}...`;
            }
            
            this.addToTranscript('system', toolMessage);
        } catch (e) {
            console.error('Error parsing tool arguments:', e);
        }
        
        // Execute tool securely on our server
        try {
            const response = await fetch('/api/tools/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.toolToken}`
                },
                body: JSON.stringify({
                    call_id: callId,
                    name: toolName,
                    args: JSON.parse(argsString)
                })
            });
            
            const result = await response.json();
            
            // Show result in transcript
            if (result.ok && result.data) {
                if (result.data.message) {
                    this.addToTranscript('system', `✅ ${result.data.message}`);
                } else if (result.data.results && Array.isArray(result.data.results)) {
                    const count = result.data.results.length;
                    const msg = count > 0 
                        ? `✅ Found ${count} properties matching your criteria`
                        : '❌ No properties found matching your criteria';
                    this.addToTranscript('system', msg);
                }
            } else if (!result.ok && result.error) {
                this.addToTranscript('system', `❌ Error: ${result.error.message}`);
            }
            
            // Send result back to OpenAI via data channel
            this.dataChannel.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(result)
                }
            }));
            
            // Tell OpenAI to continue the conversation
            this.dataChannel.send(JSON.stringify({
                type: 'response.create'
            }));
            
        } catch (error) {
            console.error('Tool execution failed:', error);
            
            // Send error back to OpenAI
            const errorResult = {
                ok: false,
                error: {
                    code: 'NETWORK_ERROR',
                    message: 'Failed to execute tool',
                    retryable: true
                }
            };
            
            this.dataChannel.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(errorResult)
                }
            }));
            
            this.dataChannel.send(JSON.stringify({
                type: 'response.create'
            }));
            
            this.addToTranscript('system', '❌ Tool execution failed');
        }
    }
    
    handleRealtimeEvent(event) {
        console.log('Realtime event:', event);
        
        switch (event.type) {
            case 'conversation.item.input_audio_transcription.delta':
                // Live user transcript chunk
                console.log('🎤 User transcript delta:', event.delta);
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                console.log('🎤 User transcript completed:', event.transcript);
                this.addToTranscript('user', event.transcript || '');
                break;
                
            case 'conversation.item.input_audio_transcription.failed':
                console.error('🎤 User transcript failed:', event.error);
                break;
                
            case 'response.text.delta':
                // Accumulate partial responses
                if (!this.currentResponse) {
                    this.currentResponse = '';
                }
                this.currentResponse += (event.delta || '');
                break;
                
            case 'response.text.done':
                if (this.currentResponse) {
                    this.addToTranscript('assistant', this.currentResponse);
                    this.currentResponse = '';
                } else if (event.text) {
                    this.addToTranscript('assistant', event.text);
                }
                break;
                
            case 'response.audio_transcript.delta':
                // Accumulate audio transcript
                if (!this.currentTranscript) {
                    this.currentTranscript = '';
                }
                this.currentTranscript += (event.delta || '');
                break;
                
            case 'response.audio_transcript.done':
                if (this.currentTranscript) {
                    this.addToTranscript('assistant', this.currentTranscript);
                    this.currentTranscript = '';
                }
                break;
                
            case 'response.audio.delta':
                console.log('Receiving audio delta');
                break;
                
            case 'response.audio.done':
                console.log('Audio response complete');
                break;
                
            case 'response.function_call_arguments.delta':
                // Accumulate streaming tool arguments
                const callId = event.call_id;
                if (!this.toolCallAccumulator.has(callId)) {
                    this.toolCallAccumulator.set(callId, { name: undefined, chunks: [] });
                }
                const acc = this.toolCallAccumulator.get(callId);
                if (event.name) acc.name = event.name;
                if (event.delta) acc.chunks.push(event.delta);
                break;
                
            case 'response.function_call_arguments.done':
                // Execute tool via our server proxy
                this.handleToolCall(event);
                break;
                
            case 'conversation.item.created':
                console.log('Conversation item created:', event.item);
                if (event.item && event.item.type === 'message' && event.item.content) {
                    event.item.content.forEach(content => {
                        if (content.type === 'text' && content.text) {
                            this.addToTranscript(event.item.role, content.text);
                        } else if (content.type === 'input_text' && content.text) {
                            this.addToTranscript(event.item.role, content.text);
                        }
                    });
                }
                break;
                
            case 'error':
                console.error('Realtime error:', event.error);
                this.addToTranscript('system', `❌ Error: ${event.error.message || 'Unknown error'}`);
                break;
        }
    }
    
    disconnect() {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        
        this.dataChannel = null;
        this.isConnected = false;
        this.toolToken = null;
        this.toolCallAccumulator.clear();
        this.updateStatus('disconnected', 'Disconnected');
        this.connectBtn.textContent = 'Connect';
        this.connectBtn.disabled = false;
    }
    
    updateStatus(status, message) {
        this.statusEl.className = `status ${status}`;
        this.statusEl.textContent = message;
    }
    
    addToTranscript(role, text) {
        // Don't add empty entries
        if (!text || text.trim() === '') return;
        
        const entry = {
            role,
            text,
            timestamp: new Date().toLocaleTimeString()
        };
        
        this.transcript.push(entry);
        this.updateTranscriptDisplay();
    }
    
    updateTranscriptDisplay() {
        const html = this.transcript.map(entry => {
            const roleLabel = {
                'user': '👤 You',
                'assistant': '🤖 CORA',
                'system': '⚙️ System'
            }[entry.role] || entry.role;
            
            const roleClass = entry.role === 'system' ? 'system' : entry.role;
            const textClass = entry.text.startsWith('✅') ? 'success' : 
                             entry.text.startsWith('❌') ? 'error' : '';
            
            return `
                <div class="transcript-entry ${roleClass} ${textClass}">
                    <div class="transcript-header">
                        <strong>${roleLabel}</strong>
                        <small>${entry.timestamp}</small>
                    </div>
                    <div class="transcript-text">${entry.text}</div>
                </div>
            `;
        }).join('');
        
        this.transcriptEl.innerHTML = html || `
            <div style="text-align: center; opacity: 0.6; margin-top: 80px;">
                Transcript will appear here when you start talking...
            </div>
        `;
        
        // Auto-scroll to bottom
        this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }
}

// Global instance
console.log('🏁 Creating CORA client instance...');
const coraClient = new CoraRealtimeClient();
console.log('✅ CORA client created');

// UI handlers
function toggleConnection() {
    console.log('🖱️ Connect button clicked!');
    if (coraClient.isConnected) {
        console.log('📤 Disconnecting...');
        coraClient.disconnect();
    } else {
        console.log('📥 Connecting...');
        coraClient.connect();
    }
}