import { useState, useRef, useCallback, useEffect } from 'react'

const REALTIME_API_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview'

export function useRealtimeVoice({ onTaskCreated }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [feedback, setFeedback] = useState('')

  const wsRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const processorRef = useRef(null)

  // Tools definition for task management
  const TOOLS = [
    {
      type: 'function',
      name: 'create_task',
      description: 'Create a task from a voice command',
      parameters: {
        type: 'object',
        properties: {
          task_type: {
            type: 'string',
            enum: ['callback', 'call', 'showing', 'follow_up', 'reminder', 'email', 'text', 'meeting', 'contract', 'listing'],
            description: 'The type of task'
          },
          title: {
            type: 'string',
            description: 'A short, clear title for the task (max 50 chars)'
          },
          description: {
            type: 'string',
            description: 'Full description of what needs to be done'
          },
          contact: {
            type: 'string',
            description: 'Name of person or company involved'
          },
          location: {
            type: 'string',
            description: 'Address or location (for showings)'
          },
          time: {
            type: 'string',
            description: 'Time or deadline mentioned'
          },
          is_urgent: {
            type: 'boolean',
            description: 'True if urgent or time-sensitive'
          },
          priority: {
            type: 'string',
            enum: ['urgent', 'high', 'normal', 'low']
          }
        },
        required: ['task_type', 'title', 'description', 'is_urgent', 'priority']
      }
    }
  ]

  const connectToRealtime = useCallback(async () => {
    try {
      // Get API key from environment or backend
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY || await fetchApiKey()

      const ws = new WebSocket(REALTIME_API_URL, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      })

      ws.onopen = () => {
        console.log('Connected to OpenAI Realtime')
        setIsConnected(true)

        // Configure session
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            input_audio_format: 'webm-opus',
            output_audio_format: 'webm-opus',
            voice: 'verse',
            instructions: `You are CORA, a real estate AI assistant. Help agents manage tasks efficiently.
              When you hear a command:
              1. Parse it to understand the intent
              2. Extract key details (names, times, locations)
              3. Call the create_task function
              4. Confirm what you're creating

              Be concise and professional. Examples:
              - "Call Mike back" → Create callback task for Mike
              - "Schedule showing at 123 Main St" → Create showing task
              - "Remind me to send contracts by 5pm" → Create reminder task`,
            tools: TOOLS,
            tool_choice: 'auto',
            turn_detection: {
              type: 'server_vad',
              silence_duration_ms: 500,
              threshold: 0.5
            }
          }
        }))
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        console.log('Realtime message:', message.type)

        switch (message.type) {
          case 'conversation.item.input_audio_transcription.completed':
            setTranscript(message.transcript)
            break

          case 'response.audio_transcript.delta':
            // AI is speaking
            setFeedback(prev => prev + message.delta)
            break

          case 'response.function_call_arguments.done':
            // Function call completed
            if (message.name === 'create_task') {
              const args = JSON.parse(message.arguments)
              handleTaskCreation(args)
            }
            break

          case 'response.done':
            setIsProcessing(false)
            break

          case 'error':
            console.error('Realtime error:', message.error)
            setFeedback('Error: ' + message.error.message)
            break
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setIsConnected(false)
      }

      ws.onclose = () => {
        console.log('Disconnected from OpenAI Realtime')
        setIsConnected(false)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to connect:', error)
      setFeedback('Failed to connect to voice service')
    }
  }, [])

  const startListening = useCallback(async () => {
    if (!wsRef.current || !isConnected) {
      await connectToRealtime()
    }

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      mediaStreamRef.current = stream
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })

      const source = audioContextRef.current.createMediaStreamSource(stream)
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        if (!isListening || !wsRef.current) return

        const inputData = e.inputBuffer.getChannelData(0)
        // Convert to 16-bit PCM
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
        }

        // Send audio to OpenAI
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
        }))
      }

      source.connect(processor)
      processor.connect(audioContextRef.current.destination)
      processorRef.current = processor

      setIsListening(true)
      setFeedback('Listening...')

      // Start conversation
      wsRef.current.send(JSON.stringify({
        type: 'response.create'
      }))

    } catch (error) {
      console.error('Failed to start listening:', error)
      setFeedback('Microphone access denied')
    }
  }, [isConnected, connectToRealtime])

  const stopListening = useCallback(() => {
    setIsListening(false)

    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // Stop microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Tell OpenAI we're done with input
    if (wsRef.current && isConnected) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }))
    }
  }, [isConnected])

  const handleTaskCreation = (args) => {
    console.log('Creating task from Realtime:', args)

    const actions = {
      callback: ['Call Now', 'Send SMS'],
      call: ['Call Now', 'Schedule Call'],
      showing: ['Confirm Time', 'Send Details'],
      follow_up: ['Call', 'Email'],
      reminder: ['Mark Done', 'Snooze'],
      email: ['Send Email', 'Draft'],
      text: ['Send SMS', 'Call'],
      meeting: ['Add to Calendar', 'Send Invite'],
      contract: ['Review', 'Send'],
      listing: ['Send Listings', 'Schedule Showing']
    }

    const task = {
      id: Date.now(),
      type: args.task_type,
      title: args.title,
      description: args.description,
      contact: args.contact || '',
      location: args.location || '',
      phone: args.phone || '',
      time: args.time || new Date().toISOString(),
      priority: args.priority,
      actions: actions[args.task_type] || ['Start', 'Add Note']
    }

    // Notify parent component
    if (onTaskCreated) {
      onTaskCreated(task, args.is_urgent)
    }

    setFeedback(`✅ ${args.is_urgent ? 'Urgent task' : 'Task'} created: ${args.title}`)
  }

  const fetchApiKey = async () => {
    // Fetch API key from your backend if not in env
    const response = await fetch('/api/config/openai-key')
    const data = await response.json()
    return data.apiKey
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      stopListening()
    }
  }, [stopListening])

  return {
    isConnected,
    isListening,
    transcript,
    feedback,
    isProcessing,
    startListening,
    stopListening,
    connectToRealtime
  }
}