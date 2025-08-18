import { useState, useEffect } from 'react'
import { Phone, Clock, ChevronDown, ChevronUp, Trash2, Archive, MessageSquare } from 'lucide-react'
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
      const response = await fetch(`${API_URL}/api/calls/recent?limit=50`)
      const data = await response.json()
      
      if (data.success && data.calls) {
        const transformedCalls = data.calls.map(call => ({
          id: call.id,
          phoneNumber: call.phone_number || 'Unknown',
          callerName: call.caller_name || 'Unknown Caller',
          duration: call.duration || 0,
          timestamp: new Date(call.created_at),
          property: 'Click to analyze',
          leadScore: 'Unknown',
          status: call.call_status || call.status || 'completed',
          callId: call.call_id,
          transcript: call.transcript,
          rawCall: call,
          analysis: null, // Will be populated when analyzed
          isAnalyzed: false
        }))
        setCalls(transformedCalls)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching calls:', error)
      setLoading(false)
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
        // Calculate actual duration from transcript
        const transcriptEntries = details.transcript?.entries || []
        let actualDuration = 0
        if (transcriptEntries.length >= 2) {
          const firstMessage = new Date(transcriptEntries[0].timestamp)
          const lastMessage = new Date(transcriptEntries[transcriptEntries.length - 1].timestamp)
          actualDuration = Math.floor((lastMessage - firstMessage) / 1000)
        }

        // Update the call with analysis results
        setCalls(prevCalls => 
          prevCalls.map(call => 
            call.id === callId ? {
              ...call,
              callerName: analysis.analysis.caller_name || call.callerName,
              property: analysis.analysis.property_interests?.length > 0 ? 
                       analysis.analysis.property_interests.join(', ') : 'No property mentioned',
              leadScore: analysis.analysis.lead_quality === 'hot' ? 'Hot' : 
                        analysis.analysis.lead_quality === 'warm' ? 'Warm' : 'Cold',
              duration: Math.max(actualDuration, call.duration),
              analysis: analysis.analysis,
              transcript: details.transcript,
              isAnalyzed: true
            } : call
          )
        )
      }
    } catch (error) {
      console.error('Error analyzing call:', error)
    }
    setAnalyzingCall(null)
  }

  const toggleCallExpansion = async (call) => {
    if (expandedCall === call.id) {
      setExpandedCall(null)
      return
    }

    setExpandedCall(call.id)
    
    // Analyze if not already analyzed
    if (!call.isAnalyzed) {
      await analyzeCall(call.id)
    }
  }

  const archiveCall = async (callId) => {
    // TODO: Implement archive functionality
    console.log('Archive call:', callId)
    // For now, just remove from the list
    setCalls(prevCalls => prevCalls.filter(call => call.id !== callId))
  }

  const deleteCall = async (callId) => {
    if (confirm('Are you sure you want to delete this call?')) {
      // TODO: Implement delete API call
      console.log('Delete call:', callId)
      setCalls(prevCalls => prevCalls.filter(call => call.id !== callId))
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
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
          <p className="text-sm text-gray-500 mt-2">Calls will appear here when customers call CORA</p>
        </div>
      ) : (
        <div className="space-y-4">
          {calls.map((call) => (
            <div
              key={call.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Call Card Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleCallExpansion(call)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
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
                      <p className="text-sm text-gray-500">
                        Property: <span className="font-medium">{call.property}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{formatTime(call.timestamp)}</p>
                      <p className="text-sm text-gray-400">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {formatDuration(call.duration)}
                      </p>
                    </div>
                    
                    {expandedCall === call.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Call Details */}
              {expandedCall === call.id && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  {call.analysis ? (
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

                      {/* Contact & Lead Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg p-3">
                          <h5 className="text-xs font-medium text-gray-600 mb-2">Contact Details</h5>
                          {call.analysis.caller_name && (
                            <p className="text-sm"><span className="font-medium">Name:</span> {call.analysis.caller_name}</p>
                          )}
                          {call.analysis.phone_number && (
                            <p className="text-sm"><span className="font-medium">Phone:</span> {call.analysis.phone_number}</p>
                          )}
                          {call.analysis.email && (
                            <p className="text-sm"><span className="font-medium">Email:</span> {call.analysis.email}</p>
                          )}
                        </div>
                        
                        <div className="bg-white rounded-lg p-3">
                          <h5 className="text-xs font-medium text-gray-600 mb-2">Requirements</h5>
                          {call.analysis.budget_mentioned && (
                            <p className="text-sm"><span className="font-medium">Budget:</span> ${call.analysis.budget_mentioned.toLocaleString()}</p>
                          )}
                          {call.analysis.bedrooms_wanted && (
                            <p className="text-sm"><span className="font-medium">Bedrooms:</span> {call.analysis.bedrooms_wanted}</p>
                          )}
                          {call.analysis.timeline && (
                            <p className="text-sm"><span className="font-medium">Timeline:</span> {call.analysis.timeline}</p>
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

                      {/* Action Buttons */}
                      <div className="flex space-x-2 pt-2">
                        <button className="flex-1 px-4 py-2 bg-coral text-white rounded-lg text-sm hover:bg-coral-dark transition-colors">
                          Schedule Follow-up
                        </button>
                        <button className="flex-1 px-4 py-2 bg-cream text-navy rounded-lg text-sm hover:bg-cream-dark transition-colors">
                          Send Details
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); archiveCall(call.id); }}
                          className="px-3 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-300 transition-colors"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteCall(call.id); }}
                          className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-gray-500 mb-2">
                        {analyzingCall === call.id ? 'Analyzing call with GPT...' : 'Click to analyze this call'}
                      </div>
                      {analyzingCall !== call.id && (
                        <button 
                          onClick={() => analyzeCall(call.id)}
                          className="px-4 py-2 bg-coral text-white rounded-lg text-sm hover:bg-coral-dark transition-colors"
                        >
                          Analyze Call
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const archiveCall = async (callId) => {
    if (confirm('Archive this call? It will be hidden from the main list.')) {
      try {
        // TODO: Add API call to mark as archived
        setCalls(prevCalls => prevCalls.filter(call => call.id !== callId))
      } catch (error) {
        console.error('Error archiving call:', error)
      }
    }
  }

  const deleteCall = async (callId) => {
    if (confirm('Are you sure you want to permanently delete this call?')) {
      try {
        // TODO: Add API call to delete call
        setCalls(prevCalls => prevCalls.filter(call => call.id !== callId))
      } catch (error) {
        console.error('Error deleting call:', error)
      }
    }
  }
}

export default Calls