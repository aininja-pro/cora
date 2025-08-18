import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, TrendingUp, Calendar } from 'lucide-react'
import { API_URL } from '../config'

function Calls() {
  const [calls, setCalls] = useState([])
  const [expandedCall, setExpandedCall] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzingCall, setAnalyzingCall] = useState(null)

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      const response = await fetch(`${API_URL}/api/calls/recent?limit=20`)
      const data = await response.json()
      
      if (data.success && data.calls) {
        // Transform database calls to frontend format
        const transformedCalls = data.calls.map(call => {
          // Parse stored GPT analysis from ai_response field
          let storedAnalysis = null
          if (call.ai_response) {
            try {
              storedAnalysis = JSON.parse(call.ai_response)
            } catch (e) {
              // ai_response might be old text format, ignore parse errors
            }
          }
          
          // Use caller_name from database if available (from GPT analysis)
          const callerName = call.caller_name || extractNameFromTranscript(call.transcript) || 'Unknown Caller'
          
          // Use property_mentioned from database if available (from GPT analysis)  
          const property = call.property_mentioned || extractPropertyFromTranscript(call.transcript) || 'No property mentioned'
          
          return {
            id: call.id,
            phoneNumber: call.phone_number || 'Unknown',
            callerName: callerName,
            duration: call.duration || 0,
            timestamp: new Date(call.created_at),
            property: property,
            leadScore: call.lead_score >= 75 ? 'Hot' : call.lead_score >= 60 ? 'Warm' : 'Cold',
            status: call.call_status || call.status || 'completed',
            callId: call.call_id,
            rawCall: call,
            analysis: storedAnalysis, // LOAD STORED ANALYSIS FROM DATABASE
            transcript: call.transcript
          }
        })
        setCalls(transformedCalls)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching calls:', error)
      setLoading(false)
    }
  }

  // Enhanced function to extract name from transcript or individual messages
  const extractNameFromTranscript = (transcript, detailedEntries = null) => {
    // List of words that are NOT names (to filter out bad extractions)
    const excludeWords = ['interested', 'looking', 'calling', 'here', 'ready', 'sorry', 'thanks', 'hello', 'hi', 'good', 'well', 'yeah', 'yes', 'no', 'okay', 'sure', 'maybe', 'just', 'also', 'really', 'very']
    
    const isValidName = (word) => {
      return word && 
             word.length >= 2 && 
             word.length <= 20 && 
             !excludeWords.includes(word.toLowerCase()) &&
             /^[A-Za-z]+$/.test(word) // Only letters
    }
    
    // First try the full transcript text
    if (transcript) {
      const nameMatch = transcript.match(/my name is (\w+)/i) || 
                       transcript.match(/name is (\w+)/i) ||
                       transcript.match(/this is (\w+)/i)
      if (nameMatch && isValidName(nameMatch[1])) {
        return nameMatch[1]
      }
    }
    
    // Then try individual message entries (more specific patterns)
    if (detailedEntries && detailedEntries.length > 0) {
      for (const entry of detailedEntries) {
        if (entry.speaker === 'user') {
          const nameMatch = entry.message.match(/my name is (\w+)/i) || 
                           entry.message.match(/name is (\w+)/i) ||
                           entry.message.match(/this is (\w+)/i) ||
                           entry.message.match(/I'm (\w+) and/i) || // Only if followed by "and"
                           entry.message.match(/I'm (\w+),/i) || // If followed by comma
                           entry.message.match(/(\w+) and my phone/i) || // "Ray and my phone number"
                           entry.message.match(/so my name is (\w+)/i)
          if (nameMatch && isValidName(nameMatch[1])) {
            return nameMatch[1]
          }
        }
      }
    }
    
    return null
  }

  // Enhanced function to extract property from transcript
  const extractPropertyFromTranscript = (transcript, detailedEntries = null) => {
    const checkForProperty = (text) => {
      if (!text) return null
      const textLower = text.toLowerCase()
      if ((textLower.includes('123') && textLower.includes('main')) || textLower.includes('123 main')) return '123 Main Street'
      if ((textLower.includes('456') && textLower.includes('oak')) || textLower.includes('456 oak')) return '456 Oak Avenue' 
      if ((textLower.includes('789') && textLower.includes('pine')) || textLower.includes('789 pine')) return '789 Pine Lane'
      return null
    }
    
    // Check full transcript first
    let property = checkForProperty(transcript)
    if (property) return property
    
    // Check individual messages
    if (detailedEntries && detailedEntries.length > 0) {
      for (const entry of detailedEntries) {
        property = checkForProperty(entry.message)
        if (property) return property
      }
    }
    
    return null
  }


  const toggleCallExpansion = async (call) => {
    if (expandedCall === call.id) {
      setExpandedCall(null)
      return
    }

    setExpandedCall(call.id)
    
    // Analyze if not already analyzed
    if (!call.analysis && !call.rawCall.ai_response) {
      await analyzeCall(call.id)
    }
  }

  const analyzeCall = async (callId) => {
    setAnalyzingCall(callId)
    try {
      const [detailsResponse, analysisResponse] = await Promise.all([
        fetch(`${API_URL}/api/calls/${callId}`),
        fetch(`${API_URL}/api/calls/${callId}/analyze`)
      ])
      
      const details = await detailsResponse.json()
      const analysis = await analysisResponse.json()
      
      if (details.success && analysis.success) {
        // Update the call with analysis results
        setCalls(prevCalls => 
          prevCalls.map(call => 
            call.id === callId ? {
              ...call,
              analysis: analysis.analysis,
              transcript: details.transcript,
              property_inquiries: details.property_inquiries,
              lead_info: details.lead_info
            } : call
          )
        )
      }
    } catch (error) {
      console.error('Error analyzing call:', error)
    }
    setAnalyzingCall(null)
  }


  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTime = (date) => {
    const now = new Date()
    const diff = now - date
    const hours = Math.floor(diff / (1000 * 60 * 60))
    
    if (hours < 1) {
      const mins = Math.floor(diff / (1000 * 60))
      return `${mins} minute${mins !== 1 ? 's' : ''} ago`
    } else if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else {
      const days = Math.floor(hours / 24)
      return `${days} day${days !== 1 ? 's' : ''} ago`
    }
  }

  const getLeadScoreColor = (score) => {
    switch(score) {
      case 'Hot': return 'text-red-600 bg-red-100'
      case 'Warm': return 'text-yellow-600 bg-yellow-100'
      case 'Cold': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading calls...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Calls List - Single Column */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-navy">Recent Calls</h2>
          <button 
            onClick={fetchCalls}
            className="px-4 py-2 bg-coral text-white rounded-lg hover:bg-coral-dark transition-colors"
          >
            Refresh
          </button>
        </div>

        {calls.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No calls yet</p>
            <p className="text-sm text-gray-500 mt-2">Calls will appear here when customers call your Synthflow number</p>
          </div>
        ) : (
          <div className="space-y-4">
            {calls.map((call) => (
              <div key={call.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Call Card Header */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleCallExpansion(call)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 bg-cream rounded-lg">
                        <Phone className="w-5 h-5 text-coral" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-navy">
                            {analyzingCall === call.id ? 'Analyzing...' : call.callerName}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLeadScoreColor(call.leadScore)}`}>
                            {call.leadScore}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{call.phoneNumber}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Property: <span className="font-medium">{call.property}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{formatTime(call.timestamp)}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {formatDuration(call.duration)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedCall === call.id && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    {analyzingCall === call.id ? (
                      <div className="text-center py-8">
                        <div className="text-gray-500">Analyzing call with GPT...</div>
                      </div>
                    ) : call.analysis ? (
                      <div className="space-y-4">
                        {/* Call Summary */}
                        <div>
                          <h4 className="font-medium text-navy mb-2">Call Summary</h4>
                          <div className="bg-white rounded-lg p-3 text-sm">
                            <p className="text-gray-700 mb-3">{call.analysis.call_summary}</p>
                            
                            {call.analysis.key_highlights?.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-gray-600 mb-2">Key Points:</p>
                                <ul className="text-xs text-gray-600 space-y-1">
                                  {call.analysis.key_highlights.map((highlight, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <span className="w-1.5 h-1.5 bg-coral rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                                      {highlight}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {call.analysis.next_actions?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-green-600 mb-2">Suggested Actions:</p>
                                <ul className="text-xs text-green-600 space-y-1">
                                  {call.analysis.next_actions.map((action, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                                      {action}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Full Conversation */}
                        <div>
                          <h4 className="font-medium text-navy mb-2">Conversation</h4>
                          <div className="bg-white rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                            {call.transcript?.entries?.length > 0 ? (
                              call.transcript.entries.map((entry, idx) => (
                                <div key={idx} className={`${entry.speaker === 'assistant' ? 'text-right' : 'text-left'}`}>
                                  <div className={`inline-block px-3 py-2 rounded-lg text-sm max-w-xs ${
                                    entry.speaker === 'assistant' 
                                      ? 'bg-coral text-white' 
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {entry.message}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {entry.speaker === 'assistant' ? 'CORA' : 'Caller'} • {new Date(entry.timestamp).toLocaleTimeString()}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500 text-sm text-center py-4">No transcript available</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="text-gray-500 mb-2">Click to analyze this call</div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); analyzeCall(call.id); }}
                          className="px-4 py-2 bg-coral text-white rounded-lg text-sm hover:bg-coral-dark transition-colors"
                        >
                          Analyze Call
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

export default Calls