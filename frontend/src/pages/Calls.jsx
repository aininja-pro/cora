import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, TrendingUp, Calendar } from 'lucide-react'
import { API_URL } from '../config'

function Calls() {
  const [calls, setCalls] = useState([])
  const [selectedCall, setSelectedCall] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      const response = await fetch(`${API_URL}/api/agent/calls`)
      const data = await response.json()
      
      if (data.success && data.calls) {
        // Transform database calls to frontend format
        const transformedCalls = data.calls.map(call => ({
          id: call.id || call.call_id,
          phoneNumber: call.phone_number || 'Unknown',
          callerName: call.caller_name || 'Unknown Caller',
          duration: call.duration || 0,
          timestamp: new Date(call.created_at || call.timestamp),
          property: call.property_mentioned || 'No property mentioned',
          leadScore: call.lead_score >= 75 ? 'Hot' : call.lead_score >= 50 ? 'Warm' : 'Cold',
          transcript: call.transcript ? [
            { speaker: 'Caller', text: call.transcript },
            { speaker: 'Cora', text: call.ai_response || 'Response pending...' }
          ] : []
        }))
        setCalls(transformedCalls)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching calls:', error)
      setLoading(false)
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
                onClick={() => setSelectedCall(call)}
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

              <div>
                <p className="text-sm text-gray-500">Property Interest</p>
                <p className="font-semibold text-navy">{selectedCall.property}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Lead Score</p>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getLeadScoreColor(selectedCall.leadScore)}`}>
                  {selectedCall.leadScore}
                </span>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Transcript</p>
                <div className="bg-gray-50 rounded-lg p-3 max-h-96 overflow-y-auto space-y-2">
                  {selectedCall.transcript.map((entry, idx) => (
                    <div key={idx} className={`${entry.speaker === 'Cora' ? 'text-right' : 'text-left'}`}>
                      <p className="text-xs text-gray-500 mb-1">{entry.speaker}</p>
                      <div className={`inline-block px-3 py-2 rounded-lg text-sm ${
                        entry.speaker === 'Cora' 
                          ? 'bg-coral text-white' 
                          : 'bg-white text-navy border border-gray-200'
                      }`}>
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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