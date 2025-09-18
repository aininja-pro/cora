import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Sparkles, X, Loader2 } from 'lucide-react'
import { API_URL } from '../../config.js'

function EnhancedVoiceAssistant({ onAddUrgent = () => {}, onAddToQueue = () => {}, onUpdateLiveFeed = () => {} }) {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showInterface, setShowInterface] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback] = useState('')
  const [recognition, setRecognition] = useState(null)
  const [isHovering, setIsHovering] = useState(false)

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
      const recognitionInstance = new SpeechRecognition()

      recognitionInstance.continuous = false
      recognitionInstance.interimResults = true
      recognitionInstance.lang = 'en-US'

      recognitionInstance.onstart = () => {
        console.log('🎤 Voice recognition started')
        setFeedback('Listening...')
      }

      recognitionInstance.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript = transcript
          }
        }

        if (finalTranscript) {
          // Process the final transcript immediately
          const fullTranscript = finalTranscript.trim()
          setTranscript(fullTranscript)
          console.log('Final transcript:', fullTranscript)
          // Call processVoiceCommand but don't let errors bubble up
          processVoiceCommand(fullTranscript).catch(error => {
            console.error('Error processing voice command:', error)
          })
        } else {
          // Show interim results but don't accumulate them
          setTranscript(interimTranscript)
        }
      }

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        setFeedback('Error: ' + event.error)
      }

      recognitionInstance.onend = () => {
        console.log('Recognition ended')
        setIsListening(false)
        // Don't close the interface - let user see the result
        // Keep the modal open so user can see the feedback
      }

      setRecognition(recognitionInstance)
    }
  }, [])

  const processVoiceCommand = async (command) => {
    if (!command || command.trim() === '') {
      setFeedback('No command detected. Please try again.')
      return
    }

    setIsProcessing(true)
    setFeedback('Processing command...')

    try {
      // Call the backend API with OpenAI processing
      const response = await fetch(`${API_URL}/api/voice/process-command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command })
      })

      if (!response.ok) {
        throw new Error('Failed to process command')
      }

      const result = await response.json()
      console.log('OpenAI processed command:', result)

      // Execute the action based on the response
      if (result.type === 'urgent') {
        await executeAction({
          type: 'add_urgent',
          data: result
        })
        setFeedback(`✅ Added: ${result.title}`)
      } else {
        await executeAction({
          type: 'add_to_queue',
          data: result
        })
        setFeedback(`✅ Added to queue: ${result.title}`)
      }

    } catch (error) {
      console.error('Error processing command:', error)
      // Fallback to local processing if backend fails
      console.log('Falling back to local processing')
      await processCommandLocally(command)
    } finally {
      setIsProcessing(false)
    }
  }

  const processCommandLocally = async (command) => {
    const lowerCommand = command.toLowerCase()
    console.log('Processing command locally:', command)

    try {
      // Pattern matching for SHOWING/APPOINTMENT commands
      if (lowerCommand.includes('showing') || lowerCommand.includes('appointment') || lowerCommand.includes('schedule')) {
        // Extract address or location
        const addressMatch = command.match(/(?:at|for)\s+(.+?)(?:\s+at\s+|$)/i) ||
                           command.match(/\d+\s+\w+\s+(?:street|st|avenue|ave|drive|dr|road|rd|lane|ln)/i)
        const address = addressMatch ? addressMatch[0].replace(/^(at|for)\s+/i, '') : 'TBD Location'

        // Extract time if mentioned
        const timeMatch = command.match(/(?:at|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
        const time = timeMatch ? timeMatch[1] : 'TBD'

        await executeAction({
          type: 'add_urgent',
          data: {
            taskType: 'showing',
            contact: address,
            task: `Schedule showing - ${address}`,
            priority: 'high',
            time: time
          }
        })
        setFeedback(`✅ Added showing for ${address}`)

      // Pattern matching for CALLBACK commands
      } else if (lowerCommand.includes('call') && lowerCommand.includes('back')) {
        // Extract name
        const nameMatch = command.match(/call\s+(.+?)\s+back/i) ||
                         command.match(/call\s+back\s+(.+)/i)
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown'

        // Clean up common speech recognition errors
        const cleanName = name.replace(/\s+(or|gore|my)$/i, '').trim()
          .replace(/mike or/i, 'Mike Orr')

        await executeAction({
          type: 'add_urgent',
          data: {
            taskType: 'callback',
            contact: cleanName,
            task: `Call back ${cleanName}`,
            priority: 'high'
          }
        })
        setFeedback(`✅ Added callback for ${cleanName}`)

      // Pattern matching for direct CALL commands (not callback)
      } else if (lowerCommand.includes('call') && !lowerCommand.includes('back')) {
        const nameMatch = command.match(/call\\s+(.+)/i)
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown'

        await executeAction({
          type: 'add_urgent',
          data: {
            taskType: 'call',
            contact: name,
            task: `Call ${name}`,
            priority: 'high'
          }
        })
        setFeedback(`✅ Added call task for ${name}`)

      // Pattern matching for URGENT tasks
      } else if (lowerCommand.includes('urgent')) {
        await executeAction({
          type: 'add_urgent',
          data: {
            taskType: 'urgent',
            contact: 'Task',
            task: command,
            priority: 'urgent'
          }
        })
        setFeedback(`✅ Added urgent task`)

      } else if (lowerCommand.includes('queue') || lowerCommand.includes('follow up')) {
        await executeAction({
          type: 'add_to_queue',
          data: {
            task: command,
            priority: 'normal'
          }
        })
        setFeedback('Added to your queue')


      } else {
        setFeedback('Command understood. What would you like me to do?')
      }
    } catch (error) {
      console.error('Error in processCommandLocally:', error)
      setFeedback('Error processing your request. Please try again.')
      throw error
    }
  }

  const executeAction = async (action) => {
    console.log('Executing action:', action)

    return new Promise((resolve, reject) => {
      try {
        switch (action.type) {
          case 'add_urgent':
            if (onAddUrgent) {
              const data = action.data
              onAddUrgent({
                id: Date.now(),
                type: data.task_type || 'callback',
                contact: data.contact || '',
                title: data.title,
                description: data.description,
                context: data.location || data.phone || '',
                time: data.time || new Date().toISOString(),
                priority: data.priority || 'urgent',
                actions: data.actions || ['Call Now', 'Add Note']
              })
              console.log('Successfully added urgent callback')
            } else {
              console.warn('onAddUrgent prop not provided')
            }
            break

          case 'add_to_queue':
            if (onAddToQueue) {
              const data = action.data
              onAddToQueue({
                id: Date.now(),
                type: data.task_type || 'follow_up',
                title: data.title,
                task: data.description,
                contact: data.contact || 'Task',
                phone: data.phone || '',
                status: 'open',
                priority: data.priority || 'normal',
                time: data.time || new Date().toISOString()
              })
              console.log('Successfully added to queue')
            } else {
              console.warn('onAddToQueue prop not provided')
            }
            break

          case 'schedule_showing':
            if (onAddUrgent) {
              onAddUrgent({
                id: Date.now(),
                type: 'showing',
                contact: action.data.description,
                title: `Schedule showing`,
                description: action.data.description,
                context: `Time: ${action.data.time}`,
                time: new Date().toISOString(),
                priority: 'urgent',
                actions: ['Confirm', 'Reschedule']
              })
              console.log('Successfully added showing')
            }
            break

          case 'initiate_call':
            if (onAddUrgent) {
              onAddUrgent({
                id: Date.now(),
                type: 'call',
                contact: action.data.contact,
                title: `Call ${action.data.contact}`,
                description: `Initiate call to ${action.data.contact}`,
                context: `Voice request`,
                time: new Date().toISOString(),
                priority: 'urgent',
                actions: ['Call Now', 'Schedule']
              })
              console.log('Successfully added call task')
            }
            break

          default:
            console.log('Unknown action:', action)
        }
        resolve()
      } catch (error) {
        console.error('Error in executeAction:', error)
        reject(error)
      }
    })
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true)
      setShowInterface(true)
      setTranscript('')
      setFeedback('Listening...')
      try {
        recognition.start()
      } catch (error) {
        console.error('Error starting recognition:', error)
        setIsListening(false)
      }
    }
  }

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop()
      setIsListening(false)
    }
  }

  // Wrap return in try-catch to prevent crashes
  try {
    return (
      <>
        {/* Enhanced Voice Interface Modal */}
        {showInterface && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation()
              // Only close if not listening or processing
              if (!isListening && !isProcessing && !transcript) {
                setShowInterface(false)
                setFeedback('')
              }
            }}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            {!isProcessing && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowInterface(false)
                  setTranscript('')
                  setFeedback('')
                  if (isListening && recognition) {
                    recognition.stop()
                  }
                }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {/* Animated mic icon */}
            <div className="flex flex-col items-center">
              <div className={`p-8 rounded-full ${isListening ? 'bg-red-100' : 'bg-coral/10'} relative`}>
                {isListening && (
                  <div className="absolute inset-0 rounded-full bg-red-200 animate-ping" />
                )}
                <Mic className={`h-12 w-12 ${isListening ? 'text-red-500' : 'text-coral'}`} />
              </div>

              {/* Status text */}
              <h3 className="mt-6 text-xl font-bold text-navy">
                {isProcessing ? 'Processing...' : isListening ? 'Listening...' : 'How can I help?'}
              </h3>

              {/* Transcript */}
              {transcript && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg w-full">
                  <p className="text-sm text-gray-700">{transcript}</p>
                </div>
              )}

              {/* Feedback */}
              {feedback && (
                <div className="mt-3 p-3 bg-green-50 text-green-700 rounded-lg w-full">
                  <p className="text-sm">{feedback}</p>
                </div>
              )}

              {/* Processing spinner */}
              {isProcessing && (
                <Loader2 className="mt-4 h-6 w-6 text-coral animate-spin" />
              )}

              {/* Control button */}
              {!isProcessing && (
                <button
                  onClick={toggleListening}
                  className={`mt-6 px-6 py-3 rounded-full font-medium transition-all ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-coral hover:bg-coral-dark text-white'
                  }`}
                >
                  {isListening ? 'Stop Listening' : 'Start Speaking'}
                </button>
              )}
            </div>

            {/* Suggestions */}
            {!transcript && !isProcessing && (
              <div className="mt-6 space-y-2">
                <p className="text-xs text-gray-500 text-center">Try saying:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-2 py-1 bg-gray-100 text-xs rounded-full text-gray-600">
                    "Add urgent callback for Sarah"
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-xs rounded-full text-gray-600">
                    "Schedule showing tomorrow at 2pm"
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-xs rounded-full text-gray-600">
                    "Add follow-up to queue"
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prominent Floating Action Button */}
      <div
        className="fixed bottom-8 right-8 z-40"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Hover label */}
        {isHovering && !showInterface && (
          <div className="absolute bottom-full right-0 mb-3 px-4 py-2 bg-gray-900 text-white rounded-lg whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-200">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-medium">Talk to CORA</span>
            </div>
            <div className="absolute top-full right-6 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
          </div>
        )}

        {/* Main Button - Larger and more prominent */}
        <button
          onClick={() => setShowInterface(true)}
          className={`
            relative group
            h-20 w-20
            rounded-full
            shadow-2xl
            bg-gradient-to-br from-coral to-coral-dark
            hover:from-coral-dark hover:to-coral
            transform transition-all duration-300
            ${isHovering ? 'scale-110' : 'scale-100'}
            hover:shadow-coral/50
            flex items-center justify-center
            ring-4 ring-white
          `}
        >
          {/* Sparkle effect */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent transform translate-y-full group-hover:translate-y-0 transition-transform duration-700" />
          </div>

          {/* Icon */}
          <Mic className="h-8 w-8 text-white relative z-10" />

          {/* Pulse effect */}
          <div className="absolute inset-0 rounded-full bg-coral animate-ping opacity-20" />
        </button>

        {/* "NEW" badge */}
        <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse">
          AI
        </div>
      </div>

    </>
    )
  } catch (error) {
    console.error('Error rendering EnhancedVoiceAssistant:', error)
    // Return a minimal fallback UI if there's an error
    return (
      <div className="fixed bottom-8 right-8 z-40">
        <button
          onClick={() => window.location.reload()}
          className="h-20 w-20 rounded-full shadow-2xl bg-red-500 text-white flex items-center justify-center"
        >
          <span className="text-xs">Error - Click to reload</span>
        </button>
      </div>
    )
  }
}

export default EnhancedVoiceAssistant