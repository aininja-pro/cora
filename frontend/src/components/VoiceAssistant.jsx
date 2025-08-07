import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react'

function VoiceAssistant({ onCommand }) {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    // Check for browser support
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event) => {
        const current = event.results[event.results.length - 1]
        const transcript = current[0].transcript
        setTranscript(transcript)
        
        if (current.isFinal) {
          processVoiceCommand(transcript)
        }
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        setIsProcessing(false)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
  }, [])

  const processVoiceCommand = async (command) => {
    setIsProcessing(true)
    
    try {
      // Send to backend for processing
      const response = await fetch('http://localhost:8000/api/agent/voice-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          agent_id: JSON.parse(localStorage.getItem('agent')).id
        })
      })
      
      const data = await response.json()
      setResponse(data.response)
      
      // Try to use ElevenLabs for better voice quality
      try {
        const ttsResponse = await fetch('http://localhost:8000/api/voice/text-to-speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: data.response,
            voice_id: '21m00Tcm4TlvDq8ikWAM' // Rachel voice (natural female)
          })
        })
        
        if (ttsResponse.ok && ttsResponse.headers.get('content-type')?.includes('audio')) {
          // Play the ElevenLabs audio
          const audioBlob = await ttsResponse.blob()
          const audioUrl = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioUrl)
          audioRef.current = audio
          setIsSpeaking(true)
          
          audio.onended = () => {
            setIsSpeaking(false)
            audioRef.current = null
          }
          
          audio.play()
        } else {
          // Fallback to browser speech synthesis
          if ('speechSynthesis' in window) {
            setIsSpeaking(true)
            const utterance = new SpeechSynthesisUtterance(data.response)
            utterance.rate = 0.95
            utterance.pitch = 1.1
            
            const voices = window.speechSynthesis.getVoices()
            const femaleVoice = voices.find(voice => 
              voice.name.includes('Samantha') || 
              voice.name.includes('Microsoft Zira') || 
              voice.name.includes('Female')
            )
            
            if (femaleVoice) {
              utterance.voice = femaleVoice
            }
            
            utterance.onend = () => {
              setIsSpeaking(false)
            }
            
            window.speechSynthesis.speak(utterance)
          }
        }
      } catch (error) {
        console.error('Error with text-to-speech:', error)
        // Fallback to browser speech
        if ('speechSynthesis' in window) {
          setIsSpeaking(true)
          const utterance = new SpeechSynthesisUtterance(data.response)
          utterance.onend = () => {
            setIsSpeaking(false)
          }
          window.speechSynthesis.speak(utterance)
        }
      }
      
      // Execute any actions returned
      if (data.action && onCommand) {
        onCommand(data.action)
      }
    } catch (error) {
      console.error('Error processing voice command:', error)
      setResponse("I didn't catch that. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  const stopSpeaking = () => {
    // Stop ElevenLabs audio if playing
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    // Stop browser speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    
    setIsSpeaking(false)
  }

  const toggleListening = () => {
    // If Cora is speaking, stop her when mic is clicked
    if (isSpeaking) {
      stopSpeaking()
      return
    }
    
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      setTranscript('')
      setResponse('')
      recognitionRef.current?.start()
      setIsListening(true)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Action Button */}
      <div className="relative">
        {/* Response Bubble */}
        {(transcript || response) && (
          <div className="absolute bottom-20 right-0 w-80 bg-white rounded-2xl shadow-xl p-4 mb-2">
            {transcript && (
              <div className="mb-2">
                <p className="text-xs text-gray-500 mb-1">You said:</p>
                <p className="text-sm text-navy">{transcript}</p>
              </div>
            )}
            {response && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Cora:</p>
                <p className="text-sm text-navy font-medium">{response}</p>
              </div>
            )}
          </div>
        )}

        {/* Mic Button */}
        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`relative w-16 h-16 rounded-full shadow-lg transition-all transform hover:scale-110 ${
            isSpeaking
              ? 'bg-blue-500 hover:bg-blue-600'
              : isListening 
              ? 'bg-red-500 hover:bg-red-600' 
              : isProcessing
              ? 'bg-gray-400'
              : 'bg-coral hover:bg-coral-dark'
          }`}
        >
          {isProcessing ? (
            <Loader2 className="w-8 h-8 text-white mx-auto animate-spin" />
          ) : isSpeaking ? (
            <>
              <Volume2 className="w-8 h-8 text-white mx-auto" />
              <span className="absolute inset-0 rounded-full bg-blue-400 animate-pulse"></span>
            </>
          ) : isListening ? (
            <>
              <MicOff className="w-8 h-8 text-white mx-auto" />
              <span className="absolute inset-0 rounded-full bg-red-400 animate-ping"></span>
            </>
          ) : (
            <Mic className="w-8 h-8 text-white mx-auto" />
          )}
        </button>

        {/* Label */}
        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <p className="text-xs text-gray-600">
            {isSpeaking ? 'Click to stop' : isListening ? 'Listening...' : isProcessing ? 'Processing...' : 'Talk to Cora'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default VoiceAssistant