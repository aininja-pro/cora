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
            1. Listen carefully for ALL details including names, phone numbers, addresses, times, and context
            2. Extract and structure everything mentioned into the task
            3. Use the create_task function with complete information
            4. Confirm what you've created with the key details

            Important extraction rules:
            - Phone numbers: Extract any phone number mentioned (e.g., "555-1234", "call him at 555-1234")
            - Names: Capture full names when mentioned (first and last)
            - Addresses: Get complete addresses including street number, name, city if mentioned
            - Times: Specific times, dates, or urgency markers ("tomorrow at 2pm", "by end of day", "ASAP")
            - Context: The reason, purpose, or additional details about WHY this task is needed

            Create comprehensive task titles and descriptions that include:
            - WHO needs to be contacted (name and/or company)
            - WHAT needs to be done (call, email, schedule, send, etc.)
            - WHEN it needs to happen (time, date, urgency)
            - WHY it's important (closing, interested buyer, contract deadline, etc.)
            - HOW to reach them (phone number if provided)

            Examples:
            - "Call Bill Brown at 555-1234 about the closing documents" →
              Title: "Call Bill Brown about closing docs"
              Contact: "Bill Brown"
              Phone: "555-1234"
              Description: "Call Bill Brown at 555-1234 regarding the closing documents"

            - "Schedule showing for Sarah Johnson at 123 Main Street tomorrow at 2pm, her number is 555-9876" →
              Title: "Showing - 123 Main St - Sarah Johnson 2pm"
              Contact: "Sarah Johnson"
              Phone: "555-9876"
              Location: "123 Main Street"
              Time: "Tomorrow at 2pm"
              Description: "Schedule showing for Sarah Johnson (555-9876) at 123 Main Street tomorrow at 2pm"

            Always extract ALL information provided and include it in the structured task.`,
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
                    description: 'Person or company name if mentioned (full name when available)'
                  },
                  phone: {
                    type: 'string',
                    description: 'Phone number if mentioned (extract in any format provided)'
                  },
                  location: {
                    type: 'string',
                    description: 'Address or location if mentioned (full address with street number and name)'
                  },
                  time: {
                    type: 'string',
                    description: 'Time, deadline or when to do this if mentioned (be specific: "2pm tomorrow", "by 5pm today", etc.)'
                  },
                  context: {
                    type: 'string',
                    description: 'Additional context, reason, or details about why this task is needed'
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