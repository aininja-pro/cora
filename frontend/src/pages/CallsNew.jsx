import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

function Calls() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCall, setSelectedCall] = useState(null)

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // TODO: Replace with real backend call
      const response = await fetch('http://localhost:8000/api/calls')
      const data = await response.json()
      
      setCalls(data.calls || [])
    } catch (err) {
      console.error('Error fetching calls:', err)
      setError('Failed to load calls')
      
      // Mock data for development
      setCalls([
        {
          id: 'call_1',
          tenant_id: 'ten_123',
          caller_number: '+15551234567',
          started_at: new Date().toISOString(),
          ended_at: null,
          status: 'active',
          outcome: null,
          duration_ms: null
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (ms) => {
    if (!ms) return 'Ongoing'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <Phone className="h-4 w-4 text-green-500" />
      case 'completed': return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700 border-green-200'
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'failed': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
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
          <span className="text-sm text-gray-500">
            {calls.length} total calls
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={fetchCalls}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Calls List */}
      <div className="grid gap-4">
        {calls.map((call) => (
          <div 
            key={call.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedCall(call)}
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(call.status)}
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {call.caller_number}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {new Date(call.started_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(call.status)}`}>
                    {call.status}
                  </span>
                  
                  <div className="text-right">
                    <div className="flex items-center space-x-1 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      <span>{formatDuration(call.duration_ms)}</span>
                    </div>
                    {call.outcome && (
                      <p className="text-xs text-gray-400 mt-1">
                        Outcome: {call.outcome}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Preview */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <MessageSquare className="h-4 w-4" />
                  <span>Click to view full transcript and tool interactions</span>
                </div>
              </div>
            </div>
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

      {/* Call Detail Modal - TODO: Implement full timeline */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-navy">Call Details</h2>
                <button
                  onClick={() => setSelectedCall(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Call Information</h3>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-gray-500">Caller</dt>
                      <dd className="font-medium">{selectedCall.caller_number}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Started</dt>
                      <dd>{new Date(selectedCall.started_at).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Duration</dt>
                      <dd>{formatDuration(selectedCall.duration_ms)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Status</dt>
                      <dd>
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedCall.status)}`}>
                          {selectedCall.status}
                        </span>
                      </dd>
                    </div>
                    {selectedCall.outcome && (
                      <div>
                        <dt className="text-gray-500">Outcome</dt>
                        <dd className="font-medium">{selectedCall.outcome}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Live Timeline</h3>
                  <div className="bg-gray-50 rounded-lg p-4 h-64 overflow-y-auto">
                    <div className="text-sm text-gray-500 text-center">
                      {/* TODO: Implement call_turns timeline with Supabase Realtime */}
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>Transcript timeline will appear here</p>
                      <p className="text-xs mt-1">Real-time updates via Supabase</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calls