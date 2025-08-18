import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, TrendingUp, Calendar } from 'lucide-react'
import { API_URL } from '../config'

function Calls() {
  const [calls, setCalls] = useState([])
  const [selectedCall, setSelectedCall] = useState(null)
  const [selectedCallDetails, setSelectedCallDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)

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
          // Determine actual call status
          const actualStatus = call.call_status === 'in_progress' && call.end_time ? 'completed' : 
                              call.call_status === 'in_progress' ? 'in_progress' : 
                              call.call_status || call.status || 'completed'
          
          return {
            id: call.id,
            phoneNumber: call.phone_number || 'Unknown',
            callerName: extractNameFromTranscript(call.transcript) || 'Unknown Caller',
            duration: call.duration || 0,
            timestamp: new Date(call.created_at),
            property: extractPropertyFromTranscript(call.transcript) || 'No property mentioned',
            leadScore: call.lead_score >= 75 ? 'Hot' : call.lead_score >= 50 ? 'Warm' : 'Cold',
            status: actualStatus,
            callId: call.call_id,
            rawCall: call // Store full call data for detailed view
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

  // Fetch detailed call information and GPT analysis
  const fetchCallDetails = async (callId, callObj = null) => {
    setLoadingDetails(true)
    try {
      // Get call details and GPT analysis in parallel
      const [detailsResponse, analysisResponse] = await Promise.all([
        fetch(`${API_URL}/api/calls/${callId}`),
        fetch(`${API_URL}/api/calls/${callId}/analyze`)
      ])
      
      const details = await detailsResponse.json()
      const analysis = await analysisResponse.json()
      
      if (details.success) {
        // Combine details with GPT analysis
        const enhancedDetails = {
          ...details,
          analysis: analysis.success ? analysis.analysis : null
        }
        
        setSelectedCallDetails(enhancedDetails)
        
        // Update the selected call with GPT-extracted information
        const currentCall = callObj || selectedCall
        if (currentCall && analysis.success) {
          const updatedCall = updateCallWithGPTAnalysis(currentCall, enhancedDetails)
          setSelectedCall(updatedCall)
          
          // Also update the call in the main calls list
          setCalls(prevCalls => 
            prevCalls.map(call => 
              call.id === callId ? updatedCall : call
            )
          )
          
          console.log("Updated call with GPT analysis:", updatedCall.callerName, updatedCall.property)
        }
      }
    } catch (error) {
      console.error('Error fetching call details:', error)
    }
    setLoadingDetails(false)
  }

  const handleCallSelect = (call) => {
    setSelectedCall(call)
    setSelectedCallDetails(null) // Clear previous details
    fetchCallDetails(call.id, call) // Pass the call object
  }

  // Calculate lead quality based on conversation content
  const calculateLeadQuality = (transcriptEntries, hasPropertyInquiries, hasLeadInfo) => {
    if (!transcriptEntries || transcriptEntries.length === 0) return 'Cold'
    
    const fullConversation = transcriptEntries.map(e => e.message).join(' ').toLowerCase()
    
    // Hot lead indicators
    const hotIndicators = ['schedule', 'appointment', 'showing', 'tour', 'visit', 'see the house', 'when can', 'available', 'phone number', 'contact']
    const hotCount = hotIndicators.filter(indicator => fullConversation.includes(indicator)).length
    
    // Warm lead indicators  
    const warmIndicators = ['interested', 'looking for', 'budget', 'bedrooms', 'price', 'tell me more', 'details', 'information']
    const warmCount = warmIndicators.filter(indicator => fullConversation.includes(indicator)).length
    
    // Additional signals
    const longConversation = transcriptEntries.length >= 6
    const providedInfo = hasLeadInfo || fullConversation.includes('name is') || fullConversation.includes('phone')
    
    if (hotCount >= 2 || providedInfo) return 'Hot'
    if (hotCount >= 1 || warmCount >= 3 || (warmCount >= 2 && longConversation)) return 'Warm' 
    if (warmCount >= 1 || hasPropertyInquiries) return 'Warm'
    return 'Cold'
  }

  // Update call information using GPT analysis (better than manual extraction)
  const updateCallWithGPTAnalysis = (call, enhancedDetails) => {
    const analysis = enhancedDetails.analysis
    console.log("GPT Analysis received:", analysis)
    if (!analysis) {
      console.log("No analysis found in enhancedDetails")
      return call
    }
    
    // Calculate duration from transcript if available
    const transcriptEntries = enhancedDetails.transcript?.entries || []
    let actualDuration = call.duration
    if (transcriptEntries.length >= 2) {
      const firstMessage = new Date(transcriptEntries[0].timestamp)
      const lastMessage = new Date(transcriptEntries[transcriptEntries.length - 1].timestamp)
      actualDuration = Math.floor((lastMessage - firstMessage) / 1000)
    }
    
    const updatedCall = {
      ...call,
      callerName: analysis.caller_name || call.callerName,
      property: analysis.property_interests?.length > 0 ? analysis.property_interests[0] : call.property,
      leadScore: analysis.lead_quality === 'hot' ? 'Hot' : 
                 analysis.lead_quality === 'warm' ? 'Warm' : 'Cold',
      duration: Math.max(actualDuration, call.duration),
      analysis: analysis // Store full analysis for detailed view
    }
    
    console.log("Call updated with GPT data:", {
      original: call.callerName,
      updated: updatedCall.callerName,
      property: updatedCall.property,
      leadScore: updatedCall.leadScore
    })
    
    return updatedCall
  }

  // Update call information when we get detailed transcript
  const updateCallWithDetails = (call, details) => {
    const transcriptEntries = details.transcript?.entries || []
    
    // Extract name from detailed entries
    const extractedName = extractNameFromTranscript(details.transcript?.full_text, transcriptEntries)
    
    // Extract property from detailed entries
    const extractedProperty = extractPropertyFromTranscript(details.transcript?.full_text, transcriptEntries)
    
    // Calculate better lead quality
    const leadQuality = calculateLeadQuality(
      transcriptEntries, 
      details.property_inquiries?.length > 0,
      !!details.lead_info
    )
    
    // Calculate actual duration from transcript timestamps
    let actualDuration = call.duration
    if (transcriptEntries.length >= 2) {
      const firstMessage = new Date(transcriptEntries[0].timestamp)
      const lastMessage = new Date(transcriptEntries[transcriptEntries.length - 1].timestamp)
      actualDuration = Math.floor((lastMessage - firstMessage) / 1000)
    }
    
    return {
      ...call,
      callerName: extractedName || call.callerName,
      property: extractedProperty || call.property,
      leadScore: leadQuality,
      duration: Math.max(actualDuration, call.duration) // Use the larger of the two
    }
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calls List */}
      <div className="lg:col-span-2 space-y-4">
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
              <div
                key={call.id}
                className={`bg-white rounded-xl p-4 hover:shadow-lg transition-shadow cursor-pointer ${
                  selectedCall?.id === call.id ? 'ring-2 ring-coral' : ''
                }`}
                onClick={() => handleCallSelect(call)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-cream rounded-lg">
                      <Phone className="w-5 h-5 text-coral" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-navy">{call.callerName}</h3>
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
            ))}
          </div>
        )}
      </div>

      {/* Call Details */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl p-6 sticky top-6">
          <h3 className="font-bold text-navy mb-4">Call Details</h3>
          
          {selectedCall ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Caller</p>
                <p className="font-semibold text-navy">{selectedCall.callerName}</p>
                <p className="text-sm text-gray-600">{selectedCall.phoneNumber}</p>
              </div>

              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-gray-500">Lead Quality</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLeadScoreColor(selectedCall.leadScore)}`}>
                    {selectedCall.leadScore}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Duration</p>
                  <p className="font-semibold text-navy">{formatDuration(selectedCall.duration)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Property Interest</p>
                <p className="font-semibold text-navy">{selectedCall.property}</p>
                {selectedCallDetails?.property_inquiries?.length > 0 && (
                  <div className="mt-1">
                    {selectedCallDetails.property_inquiries.map((inquiry, idx) => (
                      <span key={idx} className={`inline-block px-2 py-1 rounded text-xs mr-1 ${
                        inquiry.interest_level === 'very_high' ? 'bg-red-100 text-red-700' :
                        inquiry.interest_level === 'high' ? 'bg-orange-100 text-orange-700' :
                        inquiry.interest_level === 'medium' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {inquiry.interest_level} interest
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {loadingDetails ? (
                <div className="text-center py-4">
                  <div className="text-gray-500">Analyzing call...</div>
                </div>
              ) : selectedCallDetails ? (
                <div>
                  {/* Call Summary */}
                  {selectedCallDetails.analysis && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 mb-2">Call Summary</p>
                      <div className="bg-blue-50 rounded-lg p-3 text-sm">
                        <p className="font-medium text-navy mb-2">{selectedCallDetails.analysis.call_summary}</p>
                        
                        {selectedCallDetails.analysis.key_highlights?.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs text-gray-600 mb-1">Key Points:</p>
                            <ul className="text-xs text-gray-700 list-disc list-inside space-y-1">
                              {selectedCallDetails.analysis.key_highlights.map((highlight, idx) => (
                                <li key={idx}>{highlight}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {selectedCallDetails.analysis.next_actions?.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Suggested Actions:</p>
                            <ul className="text-xs text-green-700 list-disc list-inside space-y-1">
                              {selectedCallDetails.analysis.next_actions.map((action, idx) => (
                                <li key={idx}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-gray-500 mb-2">Full Conversation</p>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-96 overflow-y-auto space-y-3">
                    {selectedCallDetails.transcript?.entries?.length > 0 ? (
                      selectedCallDetails.transcript.entries.map((entry, idx) => (
                        <div key={idx} className={`${entry.speaker === 'assistant' ? 'text-right' : 'text-left'}`}>
                          <p className="text-xs text-gray-500 mb-1 capitalize">
                            {entry.speaker === 'assistant' ? 'CORA' : 'Caller'} • {new Date(entry.timestamp).toLocaleTimeString()}
                          </p>
                          <div className={`inline-block px-3 py-2 rounded-lg text-sm max-w-xs ${
                            entry.speaker === 'assistant' 
                              ? 'bg-coral text-white' 
                              : 'bg-white text-navy border border-gray-200'
                          }`}>
                            {entry.message}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm">No detailed transcript available</p>
                        {selectedCallDetails.transcript?.full_text && (
                          <div className="mt-2 p-2 bg-white rounded border text-xs text-left">
                            {selectedCallDetails.transcript.full_text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedCallDetails.property_inquiries?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Property Inquiries</p>
                      <div className="space-y-2">
                        {selectedCallDetails.property_inquiries.map((inquiry, idx) => (
                          <div key={idx} className="bg-blue-50 rounded p-2 text-sm">
                            <div className="font-medium">{inquiry.property_address}</div>
                            <div className="text-xs text-gray-600">
                              Interest: {inquiry.interest_level} • {new Date(inquiry.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCallDetails.lead_info && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Lead Information</p>
                      <div className="bg-green-50 rounded p-2 text-sm">
                        {selectedCallDetails.lead_info.name && <div>Name: {selectedCallDetails.lead_info.name}</div>}
                        {selectedCallDetails.lead_info.budget_range_max && <div>Budget: Up to ${selectedCallDetails.lead_info.budget_range_max.toLocaleString()}</div>}
                        {selectedCallDetails.lead_info.desired_bedrooms && <div>Bedrooms: {selectedCallDetails.lead_info.desired_bedrooms}</div>}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="pt-4 space-y-2">
                <button className="w-full px-4 py-2 bg-coral text-white rounded-lg hover:bg-coral-dark transition-colors">
                  Schedule Follow-up
                </button>
                <button className="w-full px-4 py-2 bg-cream text-navy rounded-lg hover:bg-cream-dark transition-colors">
                  Send Property Details
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Select a call to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Calls