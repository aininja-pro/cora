import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Sparkles, X, Loader2 } from 'lucide-react'
import { API_URL } from '../../config.js'

function EnhancedVoiceAssistant({ onAddUrgent, onAddToQueue, onUpdateLiveFeed }) {
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
      // For now, skip backend and use local processing
      // This avoids network errors that might cause crashes
      await processCommandLocally(command)

    } catch (error) {
      console.error('Error processing command:', error)
      setFeedback('Error processing command. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const processCommandLocally = async (command) => {
    const lowerCommand = command.toLowerCase()
    console.log('Processing command locally:', command)

    try {
      // Pattern matching for different commands
      if (lowerCommand.includes('urgent') || lowerCommand.includes('callback') || lowerCommand.includes('call back')) {
        // Extract name if mentioned - improved regex to catch more variations
        const namePatterns = [
          /(?:for|to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
          /to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/i // Name at the end
        ]

        let name = 'Unknown'
        for (const pattern of namePatterns) {
          const match = command.match(pattern)
          if (match) {
            name = match[1]
            break
          }
        }

        // Clean up common speech recognition errors
        name = name.replace(/\s+(or|gore|my)$/i, '').trim()
        if (name.toLowerCase().includes('mike or')) {
          name = 'Mike Orr'
        }

        await executeAction({
          type: 'add_urgent',
          data: {
            contact: name,
            task: `Callback requested - ${name}`,
            priority: 'high'
          }
        })
        setFeedback(`✅ Added urgent callback for ${name}`)

      } else if (lowerCommand.includes('queue') || lowerCommand.includes('follow up')) {
        await executeAction({
          type: 'add_to_queue',
          data: {
            task: command,
            priority: 'normal'
          }
        })
        setFeedback('Added to your queue')

      } else if (lowerCommand.includes('showing') || lowerCommand.includes('appointment')) {
        const timeMatch = command.match(/(?:at|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
        const time = timeMatch ? timeMatch[1] : 'TBD'

        await executeAction({
          type: 'schedule_showing',
          data: {
            description: command,
            time: time
          }
        })
        setFeedback(`Scheduling showing for ${time}`)

      } else if (lowerCommand.includes('call') || lowerCommand.includes('phone')) {
        const nameMatch = command.match(/(?:call|phone)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
        const name = nameMatch ? nameMatch[1] : 'Unknown'

        await executeAction({
          type: 'initiate_call',
          data: {
            contact: name
          }
        })
        setFeedback(`Preparing to call ${name}`)

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
              onAddUrgent({
                id: Date.now(),
                type: 'callback',
                contact: action.data.contact,
                description: action.data.task,
                time: new Date().toISOString(),
                priority: 'high'
              })
              console.log('Successfully added urgent callback')
            } else {
              console.warn('onAddUrgent prop not provided')
            }
            break

          case 'add_to_queue':
            if (onAddToQueue) {
              onAddToQueue({
                id: Date.now(),
                task: action.data.task,
                priority: action.data.priority || 'normal',
                time: new Date().toISOString()
              })
              console.log('Successfully added to queue')
            } else {
              console.warn('onAddToQueue prop not provided')
            }
            break

          case 'schedule_showing':
            // TODO: Integrate with calendar
            console.log('Scheduling:', action.data)
            break

          case 'initiate_call':
            // TODO: Integrate with calling system
            console.log('Initiating call to:', action.data.contact)
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

  return (
    <>
      {/* Enhanced Voice Interface Modal */}
      {showInterface && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              // Only close if not listening or processing
              if (!isListening && !isProcessing && !transcript) {
                setShowInterface(false)
              }
            }}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full animate-scale-up">
            {/* Close button */}
            {!isProcessing && (
              <button
                onClick={() => setShowInterface(false)}
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
          <div className="absolute bottom-full right-0 mb-3 px-4 py-2 bg-gray-900 text-white rounded-lg whitespace-nowrap animate-fade-in">
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
            animate-subtle-bounce
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

      {/* Custom styles */}
      <style jsx>{`
        @keyframes scale-up {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes subtle-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        .animate-scale-up {
          animation: scale-up 0.2s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-subtle-bounce {
          animation: subtle-bounce 3s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}

export default EnhancedVoiceAssistant