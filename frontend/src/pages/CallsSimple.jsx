import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

function CallsSimple() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedCall, setExpandedCall] = useState(null)
  const [callDetails, setCallDetails] = useState({})

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('Fetching calls from backend...')
      const response = await fetch('http://localhost:8000/api/calls?tenant_id=Ray%20Richards')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('Received calls data:', data)
      
      setCalls(data.calls || [])
    } catch (err) {
      console.error('Error fetching calls:', err)
      setError(err.message)
      
      // Use mock data with proper phone number for demo
      setCalls([
        {
          id: '00eb929f-7258-4982-a6d2-829c553da9ce',
          tenant_id: 'Ray Richards',
          caller_number: '+1 (316) 218-7747',  // Your actual number formatted
          agent_number: '+13168670416',
          started_at: '2025-08-24T20:55:23Z',
          ended_at: null,
          outcome: null,
          summary: 'Demo call with property search',
          status: 'active'
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (startedAt, endedAt) => {
    if (!endedAt) return 'Ongoing'
    const start = new Date(startedAt)
    const end = new Date(endedAt)
    const diffMs = end - start
    const diffSecs = Math.floor(diffMs / 1000)
    const mins = Math.floor(diffSecs / 60)
    const secs = diffSecs % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusIcon = (call) => {
    const status = call.ended_at ? 'completed' : 'active'
    switch (status) {
      case 'active': return <Phone className="h-4 w-4 text-green-500" />
      case 'completed': return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (call) => {
    const status = call.ended_at ? 'completed' : 'active'
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700 border-green-200'
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'failed': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const toggleExpansion = async (call) => {
    if (expandedCall === call.id) {
      setExpandedCall(null)
      return
    }

    setExpandedCall(call.id)
    
    // Fetch call details if not already loaded
    if (!callDetails[call.id]) {
      try {
        console.log(`Fetching details for call ${call.id}`)
        const response = await fetch(`http://localhost:8000/api/calls/${call.id}`)
        
        if (response.ok) {
          const data = await response.json()
          console.log('Call details:', data)
          
          // Try to get analysis if available
          let analysis = null;
          if (data.call?.ai_response) {
            try {
              analysis = JSON.parse(data.call.ai_response);
            } catch (e) {
              console.log('Could not parse analysis from ai_response');
            }
          }
          
          // If no analysis, trigger it
          if (!analysis) {
            try {
              console.log(`Triggering analysis for call ${call.id}`);
              const analysisResponse = await fetch(`http://localhost:8000/api/calls/${call.id}/analyze`, {
                method: 'POST'
              });
              
              if (analysisResponse.ok) {
                const analysisData = await analysisResponse.json();
                analysis = analysisData.analysis;
                console.log('Generated fresh analysis:', analysis);
              }
            } catch (error) {
              console.log('Analysis generation failed:', error);
            }
          }
          
          setCallDetails(prev => ({
            ...prev,
            [call.id]: {
              turns: data.turns || [],
              transcript: data.transcript || 'No transcript available',
              summary: data.call?.summary || analysis?.call_summary || 'Call in progress...',
              analysis: analysis,
              transcript_entries: data.transcript_entries || []
            }
          }))
        } else {
          // Mock details for demo
          setCallDetails(prev => ({
            ...prev,
            [call.id]: {
              turns: [
                { type: 'turn', role: 'user', text: 'Hi, I\'m looking for a 3-bedroom home in Austin', ts: call.started_at },
                { type: 'tool_call', tool_name: 'search_properties', tool_args: { city: 'Austin', beds: 3 }, ts: call.started_at },
                { type: 'tool_result', tool_name: 'search_properties', tool_result: { data: { results: [{ address: '123 Main St, Austin TX', price: 489000, beds: 3, baths: 2 }] } }, ts: call.started_at },
                { type: 'turn', role: 'assistant', text: 'I found a great 3-bedroom home at 123 Main Street for $489,000. Would you like to schedule a showing?', ts: call.started_at }
              ],
              transcript: 'User: Hi, I\'m looking for a 3-bedroom home in Austin\nCORA: I found a great 3-bedroom home at 123 Main Street for $489,000. Would you like to schedule a showing?',
              summary: 'Property search call - customer interested in 3BR homes in Austin'
            }
          }))
        }
      } catch (error) {
        console.error('Error fetching call details:', error)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-navy">Voice Calls</h1>
        <div className="flex items-center space-x-4">
          <button 
            onClick={fetchCalls}
            className="px-4 py-2 bg-coral text-white rounded-lg hover:bg-coral/80 transition"
          >
            Refresh
          </button>
          <span className="text-sm text-gray-500">
            {calls.length} total calls
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Error: {error}</p>
          <p className="text-sm text-red-500 mt-1">Showing fallback data</p>
        </div>
      )}

      {/* Calls List */}
      <div className="grid gap-4">
        {calls.map((call) => (
          <div 
            key={call.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div 
              className="p-6 cursor-pointer"
              onClick={() => toggleExpansion(call)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(call)}
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold text-gray-900 hover:text-coral transition">
                        {call.caller_name || call.caller_number || 'Unknown Caller'}
                      </h3>
                      {call.lead_quality && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          call.lead_quality === 'hot' ? 'bg-red-100 text-red-700' :
                          call.lead_quality === 'warm' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {call.lead_quality}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {new Date(call.started_at).toLocaleString()}
                      {call.call_type && (
                        <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {call.call_type.replace('_', ' ')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(call)}`}>
                    {call.ended_at ? 'completed' : 'active'}
                  </span>
                  
                  <div className="text-right">
                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      <span>{formatDuration(call.started_at, call.ended_at)}</span>
                    </div>
                    {call.outcome && (
                      <p className="text-xs text-gray-400 mt-1">
                        Outcome: {call.outcome}
                      </p>
                    )}
                  </div>
                  
                  {/* Expand/Collapse Icon */}
                  {expandedCall === call.id ? 
                    <ChevronUp className="h-5 w-5 text-gray-400" /> : 
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  }
                </div>
              </div>

              {/* Quick Preview */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <MessageSquare className="h-4 w-4" />
                    <span>Click to expand transcript and tool interactions</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Twilio: {call.twilio_sid?.substring(0, 10)}...
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedCall === call.id && (
              <div className="border-t border-gray-200 bg-gray-50 p-6">
                {callDetails[call.id] ? (
                  <div className="space-y-4">
                    {/* Rich Analysis (like Synthflow) */}
                    {callDetails[call.id].analysis ? (
                      <div>
                        <h4 className="font-medium text-navy mb-2">Call Analysis</h4>
                        <div className="bg-white rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                callDetails[call.id].analysis.call_type === 'property_inquiry' ? 'bg-green-100 text-green-700' :
                                callDetails[call.id].analysis.call_type === 'listing_consultation' ? 'bg-blue-100 text-blue-700' :
                                callDetails[call.id].analysis.call_type === 'callback_request' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {callDetails[call.id].analysis.call_type?.replace('_', ' ') || 'general inquiry'}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                callDetails[call.id].analysis.lead_quality === 'hot' ? 'bg-red-100 text-red-700' :
                                callDetails[call.id].analysis.lead_quality === 'warm' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {callDetails[call.id].analysis.lead_quality} lead
                              </span>
                            </div>
                          </div>
                          
                          <p className="text-sm text-gray-700">{callDetails[call.id].analysis.call_summary}</p>
                          
                          {callDetails[call.id].analysis.key_highlights?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-600 mb-2">Key Points:</p>
                              <ul className="text-xs text-gray-600 space-y-1">
                                {callDetails[call.id].analysis.key_highlights.map((highlight, idx) => (
                                  <li key={idx} className="flex items-start">
                                    <span className="w-1.5 h-1.5 bg-coral rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                                    {highlight}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {callDetails[call.id].analysis.next_actions?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-green-600 mb-2">Next Actions:</p>
                              <ul className="text-xs text-green-600 space-y-1">
                                {callDetails[call.id].analysis.next_actions.map((action, idx) => (
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
                    ) : (
                      <div>
                        <h4 className="font-medium text-navy mb-2">Call Summary</h4>
                        <p className="text-sm text-gray-700 bg-white rounded p-3">
                          {callDetails[call.id].summary}
                        </p>
                      </div>
                    )}

                    {/* Full Transcript */}
                    <div>
                      <h4 className="font-medium text-navy mb-2">Full Transcript</h4>
                      <div className="bg-white rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                        {callDetails[call.id].transcript_entries?.length > 0 ? (
                          callDetails[call.id].transcript_entries.map((entry, idx) => (
                            <div key={idx} className={`${entry.speaker === 'assistant' || entry.speaker === 'CORA' ? 'text-right' : 'text-left'}`}>
                              <div className={`inline-block px-3 py-2 rounded-lg text-sm max-w-xs ${
                                entry.speaker === 'assistant' || entry.speaker === 'CORA'
                                  ? 'bg-coral text-white' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.message}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {entry.speaker === 'assistant' || entry.speaker === 'CORA' ? 'CORA' : 'Caller'} • {new Date(entry.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 text-sm text-center py-4">No transcript available</p>
                        )}
                      </div>
                    </div>

                    {/* Timeline (Tool Events) */}
                    <div>
                      <h4 className="font-medium text-navy mb-2">Tool Events</h4>
                      <div className="bg-white rounded-lg p-4 max-h-64 overflow-y-auto space-y-3">
                        {callDetails[call.id].turns.map((turn, idx) => (
                          <div key={idx} className="flex items-start space-x-3">
                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              {turn.role === 'user' ? 
                                <User className="h-3 w-3 text-blue-500" /> : 
                                <MessageSquare className="h-3 w-3 text-coral" />
                              }
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-600">
                                  {turn.role === 'user' ? 'Caller' : turn.tool_name ? `Tool: ${turn.tool_name}` : 'CORA'}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(turn.ts).toLocaleTimeString()}
                                </span>
                              </div>
                              {turn.text && (
                                <p className="text-sm text-gray-800 mt-1">{turn.text}</p>
                              )}
                              {turn.tool_result?.data?.results && (
                                <div className="mt-2 space-y-2">
                                  <p className="text-xs text-green-700 font-medium">Found {turn.tool_result.data.results.length} properties:</p>
                                  {turn.tool_result.data.results.slice(0, 2).map((property, idx) => (
                                    <div key={idx} className="bg-green-50 rounded p-2 border border-green-200">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="text-xs font-medium text-green-800">{property.address}</p>
                                          <div className="flex items-center space-x-3 mt-1 text-xs text-green-600">
                                            <span>${property.price?.toLocaleString()}</span>
                                            <span>{property.beds}br/{property.baths}ba</span>
                                            <span>{property.sqft?.toLocaleString()} sqft</span>
                                          </div>
                                        </div>
                                        <span className="text-xs text-green-600 bg-green-100 px-1 py-0.5 rounded">
                                          {property.status}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                  {turn.tool_result.data.results.length > 2 && (
                                    <p className="text-xs text-green-600 text-center">
                                      +{turn.tool_result.data.results.length - 2} more properties
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-coral mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Loading call details...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {calls.length === 0 && !loading && (
        <div className="text-center py-12">
          <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No calls yet</h3>
          <p className="text-gray-500">
            Voice calls will appear here as they come in
          </p>
        </div>
      )}
    </div>
  )
}

export default CallsSimple