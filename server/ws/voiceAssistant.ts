import WebSocket from 'ws'
import { IncomingMessage } from 'http'

interface VoiceSession {
  id: string
  browserWs: WebSocket
  openaiWs: WebSocket | null
  isActive: boolean
}

const sessions = new Map<string, VoiceSession>()

export function handleVoiceAssistant(browserWs: WebSocket, req: IncomingMessage) {
  const sessionId = Date.now().toString()
  console.log(`[Voice Assistant] New connection: ${sessionId}`)

  let openaiWs: WebSocket | null = null

  // Create session
  const session: VoiceSession = {
    id: sessionId,
    browserWs,
    openaiWs: null,
    isActive: true
  }
  sessions.set(sessionId, session)

  // Connect to OpenAI Realtime API
  const connectToOpenAI = () => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      browserWs.send(JSON.stringify({
        type: 'error',
        error: 'OpenAI API key not configured'
      }))
      return
    }

    const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview'
    openaiWs = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    })

    session.openaiWs = openaiWs

    openaiWs.on('open', () => {
      console.log(`[Voice Assistant] Connected to OpenAI for session ${sessionId}`)

      // Configure the session for task management
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          voice: 'verse',
          instructions: `You are CORA, a real estate AI assistant helping agents manage their tasks.

            When you receive a command:
            1. Understand the intent and extract details
            2. Use the create_task function to structure the task
            3. Confirm briefly what you've created

            Be professional and concise. Examples:
            - "Call the title company back to remind them about closing" → Callback task for title company with closing reminder
            - "Schedule showing at 123 Main St for 2pm" → Showing task with address and time
            - "Remind me to call Mike Orr, this is urgent" → Urgent callback for Mike Orr

            Always use the create_task function to structure tasks properly.`,
          tools: [
            {
              type: 'function',
              name: 'create_task',
              description: 'Create a structured task from voice command',
              parameters: {
                type: 'object',
                properties: {
                  task_type: {
                    type: 'string',
                    enum: ['callback', 'call', 'showing', 'follow_up', 'reminder', 'email', 'text', 'meeting', 'contract', 'listing', 'other'],
                    description: 'Type of task based on what needs to be done'
                  },
                  title: {
                    type: 'string',
                    description: 'Short clear title that captures the essence (max 50 chars)'
                  },
                  description: {
                    type: 'string',
                    description: 'Full task description with all details mentioned'
                  },
                  contact: {
                    type: 'string',
                    description: 'Person or company name if mentioned'
                  },
                  location: {
                    type: 'string',
                    description: 'Address or location if mentioned'
                  },
                  time: {
                    type: 'string',
                    description: 'Time, deadline or when to do this if mentioned'
                  },
                  is_urgent: {
                    type: 'boolean',
                    description: 'True if marked urgent, ASAP, or time-sensitive'
                  },
                  priority: {
                    type: 'string',
                    enum: ['urgent', 'high', 'normal', 'low'],
                    description: 'Priority level based on urgency and importance'
                  }
                },
                required: ['task_type', 'title', 'description', 'is_urgent', 'priority']
              }
            }
          ],
          tool_choice: 'auto',
          turn_detection: {
            type: 'server_vad',
            silence_duration_ms: 500,
            threshold: 0.5,
            prefix_padding_ms: 300
          }
        }
      }))

      // Notify browser we're connected
      browserWs.send(JSON.stringify({
        type: 'connected',
        sessionId
      }))
    })

    openaiWs.on('message', (data: WebSocket.Data) => {
      // Forward all OpenAI messages to browser
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(data.toString())
      }
    })

    openaiWs.on('error', (error) => {
      console.error(`[Voice Assistant] OpenAI WebSocket error:`, error)
      browserWs.send(JSON.stringify({
        type: 'error',
        error: 'Connection to AI service failed'
      }))
    })

    openaiWs.on('close', () => {
      console.log(`[Voice Assistant] OpenAI connection closed for session ${sessionId}`)
      session.openaiWs = null
    })
  }

  // Handle messages from browser
  browserWs.on('message', (data: WebSocket.Data) => {
    const message = data.toString()

    try {
      const parsed = JSON.parse(message)

      // Special handling for connection request
      if (parsed.type === 'connect') {
        connectToOpenAI()
        return
      }

      // Forward all other messages to OpenAI
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(message)
      } else {
        browserWs.send(JSON.stringify({
          type: 'error',
          error: 'Not connected to AI service'
        }))
      }
    } catch (e) {
      // If it's not JSON, assume it's binary audio data
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(data)
      }
    }
  })

  browserWs.on('close', () => {
    console.log(`[Voice Assistant] Browser disconnected: ${sessionId}`)
    session.isActive = false

    // Close OpenAI connection if exists
    if (openaiWs) {
      openaiWs.close()
    }

    sessions.delete(sessionId)
  })

  browserWs.on('error', (error) => {
    console.error(`[Voice Assistant] Browser WebSocket error:`, error)
  })

  console.log('[Voice Assistant] Handler initialized for session', sessionId)
}