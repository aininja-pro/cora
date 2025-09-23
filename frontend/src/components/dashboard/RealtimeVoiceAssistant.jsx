import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'

function RealtimeVoiceAssistant({ onAddUrgent, onAddToQueue }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showInterface, setShowInterface] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const wsRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)

  // Connect to our WebSocket bridge to OpenAI Realtime
  const connectToRealtime = useCallback(() => {
    // Use local server in dev, production in prod
    const wsUrl = window.location.hostname === 'localhost'
      ? 'ws://localhost:3000/ws/voice-assistant'
      : 'wss://cora-server.onrender.com/ws/voice-assistant'

    console.log('Connecting to Realtime via:', wsUrl)

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('Connected to voice assistant WebSocket')
      setIsConnected(true)

      // Send connect message to trigger OpenAI connection
      ws.send(JSON.stringify({ type: 'connect' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('Realtime message:', message.type)

        switch (message.type) {
          case 'connected':
            setFeedback('Ready to listen')
            break

          case 'conversation.item.input_audio_transcription.completed':
            setTranscript(message.transcript)
            break

          case 'response.function_call_arguments.done':
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
            setFeedback('Error: ' + message.error)
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
      console.log('Disconnected from voice assistant')
      setIsConnected(false)
    }

    wsRef.current = ws
  }, [])

  // Handle task creation from OpenAI function call
  const handleTaskCreation = (args) => {
    console.log('Creating task from Realtime:', args)

    const actions = {
      callback: ['Call Now', 'Send SMS'],
      call: ['Call Now', 'Schedule'],
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
      context: args.location || '',
      time: args.time || new Date().toISOString(),
      priority: args.priority,
      actions: actions[args.task_type] || ['Start', 'Add Note']
    }

    // Add to appropriate list
    if (args.is_urgent) {
      onAddUrgent(task)
      setFeedback(`✅ Added urgent: ${args.title}`)
    } else {
      onAddToQueue(task)
      setFeedback(`✅ Added to queue: ${args.title}`)
    }
  }

  // Start listening - capture audio and stream to Realtime
  const startListening = async () => {
    if (!isConnected) {
      connectToRealtime()
      return
    }

    try {
      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      mediaStreamRef.current = stream
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

        // Convert float32 to PCM16
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send audio chunk to server
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
        }))
      }

      source.connect(processor)
      processor.connect(audioContextRef.current.destination)
      processorRef.current = processor

    } catch (error) {
      console.error('Failed to start listening:', error)
      setFeedback('Microphone access denied')
    }
  }

  // Stop listening
  const stopListening = () => {
    setIsListening(false)

    // Commit audio buffer and create response
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
  }

  // Toggle listening
  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      stopListening()
    }
  }, [])

  return (
    <>
      {/* Modal */}
      {showInterface && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (!isListening && !isProcessing) {
                setShowInterface(false)
                setTranscript('')
                setFeedback('')
              }
            }}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
            <button
              onClick={() => {
                setShowInterface(false)
                stopListening()
              }}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center">
              <div className={`p-8 rounded-full ${isListening ? 'bg-red-100' : 'bg-coral/10'} relative`}>
                {isListening && (
                  <div className="absolute inset-0 rounded-full bg-red-200 animate-ping" />
                )}
                <Mic className={`h-12 w-12 ${isListening ? 'text-red-500' : 'text-coral'}`} />
              </div>

              <h3 className="mt-6 text-xl font-bold text-navy">
                {isProcessing ? 'Processing...' : isListening ? 'Listening...' : 'Using OpenAI Realtime'}
              </h3>

              {transcript && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg w-full">
                  <p className="text-sm text-gray-700">{transcript}</p>
                </div>
              )}

              {feedback && (
                <div className="mt-3 p-3 bg-green-50 text-green-700 rounded-lg w-full">
                  <p className="text-sm">{feedback}</p>
                </div>
              )}

              {isProcessing && (
                <Loader2 className="mt-4 h-6 w-6 text-coral animate-spin" />
              )}

              {!isProcessing && (
                <button
                  onClick={toggleListening}
                  className={`mt-6 px-6 py-3 rounded-full font-medium transition-all ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-coral hover:bg-coral-dark text-white'
                  }`}
                >
                  {isListening ? 'Stop' : 'Start Speaking'}
                </button>
              )}

              {!isConnected && (
                <p className="text-xs text-gray-500 mt-2">Connecting to OpenAI Realtime...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <div className="fixed bottom-8 right-8 z-40">
        <button
          onClick={() => {
            setShowInterface(true)
            if (!isConnected) {
              connectToRealtime()
            }
          }}
          className="h-20 w-20 rounded-full shadow-2xl bg-gradient-to-br from-coral to-coral-dark hover:from-coral-dark hover:to-coral transform transition-all hover:scale-110 flex items-center justify-center ring-4 ring-white"
        >
          <Mic className="h-8 w-8 text-white" />
        </button>

        <div className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs px-2 py-1 rounded-full font-bold">
          REALTIME
        </div>
      </div>
    </>
  )
}

export default RealtimeVoiceAssistant