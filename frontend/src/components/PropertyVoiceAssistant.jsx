import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, X } from 'lucide-react'

function PropertyVoiceAssistant({ propertyId, propertyAddress, onContactAdded, onTaskAdded }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const wsRef = useRef(null)
  const audioContextRef = useRef(null)
  const streamRef = useRef(null)
  const processedEventIds = useRef(new Set()) // Track processed function calls to prevent duplicates
  const recentSubmissions = useRef(new Map()) // Track recent submissions by content hash

  const connectToRealtime = () => {
    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.close()
    }

    const wsUrl = window.location.hostname === 'localhost'
      ? 'ws://localhost:3000/ws/voice-assistant'
      : 'wss://cora-server.onrender.com/ws/voice-assistant'

    console.log('Connecting to:', wsUrl)
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('✅ Connected to property voice assistant')
      setIsConnected(true)
      setFeedback('Ready to listen')

      // Send connect message to trigger OpenAI connection (same as dashboard)
      console.log('Sending connect message...')
      ws.send(JSON.stringify({ type: 'connect' }))
    }

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('Received message:', message.type, message)

        switch (message.type) {
          case 'connected':
            setFeedback('Ready to listen')
            break

          case 'conversation.item.input_audio_transcription.completed':
            console.log('Transcript:', message.transcript)
            setTranscript(message.transcript)
            break

          case 'response.function_call_arguments.done':
            console.log('✅ Function call received:', message.name)
            console.log('Arguments:', message.arguments)

            // Prevent duplicate function calls by checking event_id
            if (message.event_id && processedEventIds.current.has(message.event_id)) {
              console.log('⏭️ Skipping duplicate function call:', message.event_id)
              break
            }

            if (message.name === 'create_task') {
              try {
                const args = JSON.parse(message.arguments)
                console.log('Parsed args:', args)

                // Mark this event as processed
                if (message.event_id) {
                  processedEventIds.current.add(message.event_id)
                }

                await handleTaskCreation(args)
              } catch (err) {
                console.error('Error parsing function args:', err)
              }
            }
            break

          case 'response.done':
            setIsProcessing(false)
            break

          case 'error':
            console.error('❌ Realtime error:', message.error)
            console.error('Full error object:', message)
            setFeedback('Error occurred')
            setIsProcessing(false)
            break
        }
      } catch (e) {
        console.log('Non-JSON message, likely audio')
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setFeedback('Connection error')
      setIsConnected(false)
    }

    ws.onclose = () => {
      console.log('Disconnected from property voice assistant')
      setIsConnected(false)
    }

    wsRef.current = ws
  }

  const handleTaskCreation = async (args) => {
    console.log('Creating task for property:', args)
    console.log('Full args:', JSON.stringify(args, null, 2))

    // Create a content hash to detect duplicates
    const contentHash = `${args.title || ''}-${args.description || ''}-${args.contact || ''}`.toLowerCase()
    const now = Date.now()

    // Check if we submitted this exact content in the last 5 seconds
    if (recentSubmissions.current.has(contentHash)) {
      const lastSubmission = recentSubmissions.current.get(contentHash)
      if (now - lastSubmission < 5000) {
        console.log('⏭️ Skipping duplicate submission (same content within 5s):', contentHash)
        return
      }
    }

    // Mark this content as submitted
    recentSubmissions.current.set(contentHash, now)

    // Clean up old entries (older than 10 seconds)
    for (const [hash, timestamp] of recentSubmissions.current.entries()) {
      if (now - timestamp > 10000) {
        recentSubmissions.current.delete(hash)
      }
    }

    // Determine if this is a contact (person) or task (action) based on context
    const combined = (args.description + ' ' + args.title).toLowerCase()

    // Check if we have a contact name
    const hasContactName = args.contact && args.contact.length > 2

    // Check for role keywords
    const mentionsRole = combined.includes('buyer') ||
                         combined.includes('inspector') ||
                         combined.includes('title company') ||
                         combined.includes('lender') ||
                         combined.includes('attorney') ||
                         combined.includes('appraiser') ||
                         combined.includes('contractor')

    // Check for "adding" language
    const isAddingPerson = combined.includes('add') ||
                           combined.includes('added') ||
                           combined.includes('potential buyer') ||
                           combined.includes('potential inspector') ||
                           (hasContactName && mentionsRole && !combined.includes('call him') && !combined.includes('call her') && !combined.includes('contact him') && !combined.includes('contact her'))

    // Check for action verbs that indicate it's a task, not a contact addition
    const isActionTask = (combined.includes('call') && (combined.includes('about') || combined.includes('regarding') || combined.includes('to discuss'))) ||
                         combined.includes('schedule a') ||
                         combined.includes('send to') ||
                         combined.includes('follow up with') ||
                         combined.includes('remind') ||
                         combined.includes('meet with') ||
                         combined.includes('email about')

    console.log('Classification debug:', {
      hasContactName,
      mentionsRole,
      isAddingPerson,
      isActionTask,
      contactName: args.contact
    })

    // Priority: If it explicitly mentions adding AND has a contact name AND a role, it's a contact
    if (hasContactName && isAddingPerson && mentionsRole && !isActionTask) {
      // Save as contact
      console.log('→ Saving as CONTACT')
      await handleAddContact(args)
    } else {
      // Save as task with property_id
      console.log('→ Saving as TASK')
      await handleAddTask(args)
    }
  }

  const handleAddContact = async (args) => {
    // Determine contact type from description and title
    const combined = (args.description + ' ' + args.title).toLowerCase()
    let contactType = 'other'

    if (combined.includes('buyer') || combined.includes('potential buyer')) {
      contactType = 'buyer'
    } else if (combined.includes('inspector') || combined.includes('inspection')) {
      contactType = 'inspector'
    } else if (combined.includes('title') || combined.includes('title company')) {
      contactType = 'title_company'
    } else if (combined.includes('lender') || combined.includes('mortgage')) {
      contactType = 'lender'
    } else if (combined.includes('attorney') || combined.includes('lawyer')) {
      contactType = 'attorney'
    } else if (combined.includes('appraiser')) {
      contactType = 'appraiser'
    } else if (combined.includes('contractor')) {
      contactType = 'contractor'
    }

    try {
      const response = await fetch(`http://localhost:8000/api/properties/${propertyId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          agent_id: '11111111-1111-1111-1111-111111111111',
          contact_type: contactType,
          name: args.contact,
          phone: args.phone || null,
          email: null,
          notes: args.description,
          status: 'active'
        })
      })

      if (response.ok) {
        setFeedback(`✅ Added ${args.contact} to property`)
        if (onContactAdded) onContactAdded()
      }
    } catch (err) {
      console.error('Error adding contact:', err)
      setFeedback('❌ Failed to add contact')
    }
  }

  const handleAddTask = async (args) => {
    try {
      const response = await fetch(`http://localhost:8000/api/properties/${propertyId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          agent_id: '11111111-1111-1111-1111-111111111111',
          title: args.title,
          description: args.description,
          task_type: args.task_type || 'other',
          priority: args.priority || 'normal'
        })
      })

      if (response.ok) {
        setFeedback(`✅ Added: ${args.title}`)
        if (onTaskAdded) onTaskAdded()
      }
    } catch (err) {
      console.error('Error adding task:', err)
      setFeedback('❌ Failed to add task')
    }
  }

  const startListening = async () => {
    if (!isConnected) {
      connectToRealtime()
      return
    }

    // Clear processed events for new voice command
    processedEventIds.current.clear()

    try {
      // Get microphone (same as dashboard)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      streamRef.current = stream
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      })

      const source = audioContextRef.current.createMediaStreamSource(stream)
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1)

      setIsListening(true)
      setFeedback('Listening...')
      setIsProcessing(true)

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

        const inputData = e.inputBuffer.getChannelData(0)

        // Convert float32 to PCM16 (exact same as dashboard)
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send audio chunk to server (formatted like dashboard)
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
        }))
      }

      source.connect(processor)
      processor.connect(audioContextRef.current.destination)

    } catch (error) {
      console.error('Failed to start listening:', error)
      setFeedback('Microphone access denied')
    }
  }

  const stopListening = () => {
    setIsListening(false)

    // Commit audio buffer and create response (same as dashboard)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }))

      // Tell OpenAI to generate a response
      wsRef.current.send(JSON.stringify({
        type: 'response.create'
      }))
    }

    // Stop audio processing
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    setFeedback('Processing...')
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
      stopListening()
    }
  }, [])

  return (
    <div className="bg-gradient-to-br from-coral to-pink-500 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">Property Voice Assistant</h3>
          <p className="text-sm opacity-90">Add contacts, tasks, and notes</p>
        </div>
        {isConnected && (
          <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded-full">
            Connected
          </span>
        )}
      </div>

      {transcript && (
        <div className="bg-white bg-opacity-20 rounded-lg p-3 mb-4">
          <p className="text-sm">"{transcript}"</p>
        </div>
      )}

      {feedback && (
        <div className="bg-white bg-opacity-20 rounded-lg p-3 mb-4">
          <p className="text-sm font-medium">{feedback}</p>
        </div>
      )}

      <button
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing && !isListening}
        className={`w-full py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-3 ${
          isListening
            ? 'bg-red-500 hover:bg-red-600 animate-pulse'
            : 'bg-white text-coral hover:bg-opacity-90'
        } ${isProcessing && !isListening ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isListening ? (
          <>
            <MicOff className="h-6 w-6" />
            Stop Listening
          </>
        ) : (
          <>
            <Mic className="h-6 w-6" />
            Start Voice Command
          </>
        )}
      </button>

      <div className="mt-4 text-xs opacity-80">
        <p className="font-semibold mb-1">Try saying:</p>
        <p>• "Add John Smith as a buyer, phone 555-1234"</p>
        <p>• "Add Mike's Inspections as the inspector"</p>
        <p>• "Schedule closing for next Friday"</p>
      </div>
    </div>
  )
}

export default PropertyVoiceAssistant
