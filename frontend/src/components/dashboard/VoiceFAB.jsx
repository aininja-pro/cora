import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Calendar, Search, Send, Phone, FileText, Users } from 'lucide-react'

function VoiceFAB() {
  const [isListening, setIsListening] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [recognition, setRecognition] = useState(null)
  const [transcript, setTranscript] = useState('')
  const pressTimer = useRef(null)
  const commandTimeout = useRef(null)

  const quickCommands = [
    { command: 'Schedule showing', icon: Calendar, example: '"Schedule showing for 123 Main Street"', keywords: ['schedule', 'showing', 'appointment'] },
    { command: 'Search properties', icon: Search, example: '"Search properties under 500K"', keywords: ['search', 'properties', 'find'] },
    { command: 'Send recap', icon: Send, example: '"Send recap to John Smith"', keywords: ['send', 'recap', 'summary'] },
    { command: 'Call back', icon: Phone, example: '"Call back Sarah Johnson"', keywords: ['call', 'callback', 'phone'] },
    { command: 'Add note', icon: FileText, example: '"Add note about client preferences"', keywords: ['note', 'add note', 'document'] },
    { command: 'Assign to agent', icon: Users, example: '"Assign lead to Mike"', keywords: ['assign', 'agent', 'transfer'] }
  ]

  // Initialize speech recognition on component mount
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
      const recognitionInstance = new SpeechRecognition()
      
      recognitionInstance.continuous = false
      recognitionInstance.interimResults = false
      recognitionInstance.lang = 'en-US'
      
      recognitionInstance.onstart = () => {
        console.log('Speech recognition started')
      }
      
      recognitionInstance.onresult = (event) => {
        const spokenText = event.results[0][0].transcript
        setTranscript(spokenText)
        processVoiceCommand(spokenText)
      }
      
      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
      }
      
      recognitionInstance.onend = () => {
        setIsListening(false)
      }
      
      setRecognition(recognitionInstance)
    } else {
      console.warn('Speech recognition not supported in this browser')
    }
  }, [])

  const processVoiceCommand = (spokenText) => {
    const text = spokenText.toLowerCase()
    
    // Find matching command
    for (const cmd of quickCommands) {
      if (cmd.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
        executeCommand(cmd.command, spokenText)
        return
      }
    }
    
    // No specific command found, show general message
    showCommandResult(`Heard: "${spokenText}"`, 'Try one of the available commands')
  }

  const executeCommand = (command, originalText) => {
    switch (command) {
      case 'Schedule showing':
        showCommandResult('Scheduling showing...', 'Opening calendar to schedule appointment')
        // TODO: Integrate with actual scheduling system
        break
      case 'Search properties':
        showCommandResult('Searching properties...', 'Opening property search with your criteria')
        // TODO: Integrate with property search
        break
      case 'Send recap':
        showCommandResult('Sending recap...', 'Preparing call summary for client')
        // TODO: Integrate with recap system
        break
      case 'Call back':
        showCommandResult('Initiating callback...', 'Preparing to dial client')
        // TODO: Integrate with calling system
        break
      case 'Add note':
        showCommandResult('Adding note...', 'Opening note editor')
        // TODO: Integrate with notes system
        break
      case 'Assign to agent':
        showCommandResult('Assigning to agent...', 'Transferring lead')
        // TODO: Integrate with assignment system
        break
      default:
        showCommandResult('Command recognized', 'Processing your request...')
    }
  }

  const showCommandResult = (title, message) => {
    // Show result in a temporary overlay
    const overlay = document.createElement('div')
    overlay.className = 'fixed top-20 left-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50 animate-slide-down'
    overlay.innerHTML = `
      <h4 class="font-bold">${title}</h4>
      <p class="text-sm">${message}</p>
    `
    
    document.body.appendChild(overlay)
    
    setTimeout(() => {
      overlay.remove()
    }, 3000)
  }

  const handleMouseDown = () => {
    setIsPressed(true)
    pressTimer.current = setTimeout(() => {
      startListening()
    }, 100)
  }

  const handleMouseUp = () => {
    setIsPressed(false)
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
    }
    if (isListening) {
      stopListening()
    }
  }

  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true)
      setTranscript('')
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

  const handleTouchStart = (e) => {
    e.preventDefault()
    handleMouseDown()
  }

  const handleTouchEnd = (e) => {
    e.preventDefault()
    handleMouseUp()
  }

  const toggleCommands = () => {
    setShowCommands(!showCommands)
  }

  return (
    <>
      {/* Commands Sheet - Slides up from bottom */}
      {showCommands && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20" 
            onClick={() => setShowCommands(false)}
          />
          
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-xl border-t border-gray-200 p-4 animate-slide-up">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
            
            <h3 className="text-lg font-bold text-navy mb-2">Voice Commands</h3>
            <p className="text-sm text-gray-600 mb-4">Hold the mic button and say any of these commands:</p>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {quickCommands.map((cmd, index) => {
                const IconComponent = cmd.icon
                return (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <IconComponent className="h-5 w-5 text-coral flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-navy">{cmd.command}</p>
                      <p className="text-sm text-gray-500">{cmd.example}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <button
              onClick={() => setShowCommands(false)}
              className="w-full mt-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Voice FAB */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
        {/* See All Commands Button */}
        <button
          onClick={toggleCommands}
          className="px-3 py-2 bg-white text-gray-700 text-sm rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-all duration-200 opacity-0 hover:opacity-100 group-hover:opacity-100"
        >
          See all commands
        </button>

        {/* Main FAB Button */}
        <div className="group relative">
          <button
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={`
              h-14 w-14 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center
              ${isListening 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                : 'bg-coral hover:bg-coral-dark'
              }
              ${isPressed ? 'scale-95' : 'scale-100 hover:scale-105'}
              active:scale-95
            `}
          >
            {isListening ? (
              <MicOff className="h-6 w-6 text-white" />
            ) : (
              <Mic className="h-6 w-6 text-white" />
            )}
          </button>

          {/* Listening indicator */}
          {isListening && (
            <div className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping"></div>
          )}

          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {isListening ? 'Release to stop' : 'Hold to speak'}
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>

        {/* Status indicator */}
        {isListening && (
          <div className="absolute -top-16 right-0 px-3 py-2 bg-red-500 text-white text-sm rounded-lg shadow-lg">
            Listening...
          </div>
        )}
      </div>

      {/* Add custom styles for animations */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes slide-down {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </>
  )
}

export default VoiceFAB