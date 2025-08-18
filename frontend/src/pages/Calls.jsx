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
        const transformedCalls = data.calls.map(call => ({
          id: call.id,
          phoneNumber: call.phone_number || 'Unknown',
          callerName: extractNameFromTranscript(call.transcript) || 'Unknown Caller',
          duration: call.duration || 0,
          timestamp: new Date(call.created_at),
          property: extractPropertyFromTranscript(call.transcript) || 'No property mentioned',
          leadScore: call.lead_score >= 75 ? 'Hot' : call.lead_score >= 50 ? 'Warm' : 'Cold',
          status: call.call_status || call.status || 'completed',
          callId: call.call_id,
          rawCall: call // Store full call data for detailed view
        }))
        setCalls(transformedCalls)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching calls:', error)
      setLoading(false)
    }
  }

  // Helper function to extract name from transcript
  const extractNameFromTranscript = (transcript) => {
    if (!transcript) return null
    const nameMatch = transcript.match(/my name is (\w+)/i) || transcript.match(/I'm (\w+)/i)
    return nameMatch ? nameMatch[1] : null
  }

  // Helper function to extract property from transcript  
  const extractPropertyFromTranscript = (transcript) => {
    if (!transcript) return null
    if (transcript.includes('123') && transcript.includes('main')) return '123 Main Street'
    if (transcript.includes('456') && transcript.includes('oak')) return '456 Oak Avenue' 
    if (transcript.includes('789') && transcript.includes('pine')) return '789 Pine Lane'
    return null
  }

  // Fetch detailed call information including full transcript
  const fetchCallDetails = async (callId) => {
    setLoadingDetails(true)
    try {
      const response = await fetch(`${API_URL}/api/calls/${callId}`)
      const data = await response.json()
      
      if (data.success) {
        setSelectedCallDetails(data)
      }
    } catch (error) {
      console.error('Error fetching call details:', error)
    }
    setLoadingDetails(false)
  }

  const handleCallSelect = (call) => {
    setSelectedCall(call)
    setSelectedCallDetails(null) // Clear previous details
    fetchCallDetails(call.id)
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
                <p className="text-xs text-gray-500">Call ID: {selectedCall.callId || 'Unknown'}</p>
              </div>

              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    selectedCall.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {selectedCall.status}
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
              </div>

              {loadingDetails ? (
                <div className="text-center py-4">
                  <div className="text-gray-500">Loading transcript...</div>
                </div>
              ) : selectedCallDetails ? (
                <div>
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