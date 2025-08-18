import { useState, useEffect } from 'react'
import { Phone, Clock, MessageSquare, ChevronDown, ChevronUp, Archive, Trash2, Check, Square } from 'lucide-react'
import { API_URL } from '../config'

function Calls() {
  const [calls, setCalls] = useState([])
  const [expandedCall, setExpandedCall] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzingCall, setAnalyzingCall] = useState(null)
  const [selectedCalls, setSelectedCalls] = useState(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      const response = await fetch(`${API_URL}/api/calls/recent?limit=50`)
      const data = await response.json()
      
      if (data.success && data.calls) {
        const transformedCalls = data.calls.map(call => {
          // Parse stored GPT analysis from ai_response field
          let storedAnalysis = null
          if (call.ai_response) {
            try {
              storedAnalysis = JSON.parse(call.ai_response)
            } catch (e) {
              // Ignore parse errors for old format
            }
          }
          
          return {
            id: call.id,
            phoneNumber: call.phone_number || 'Unknown',
            callerName: call.caller_name || 'Unknown Caller',
            duration: call.duration || 0,
            timestamp: new Date(call.created_at),
            property: call.property_mentioned || 'No property mentioned',
            leadScore: call.lead_score >= 75 ? 'Hot' : call.lead_score >= 60 ? 'Warm' : 'Cold',
            callId: call.call_id,
            analysis: storedAnalysis,
            transcript: null,
            hasStoredAnalysis: !!storedAnalysis
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

  const toggleCallExpansion = async (call) => {
    if (expandedCall === call.id) {
      setExpandedCall(null)
      return
    }

    setExpandedCall(call.id)
    
    // Fetch transcript if not already loaded
    if (!call.transcript) {
      await fetchCallDetails(call.id)
    }
  }

  const fetchCallDetails = async (callId) => {
    setAnalyzingCall(callId)
    try {
      const response = await fetch(`${API_URL}/api/calls/${callId}`)
      const details = await response.json()
      
      if (details.success) {
        setCalls(prevCalls => 
          prevCalls.map(call => 
            call.id === callId ? {
              ...call,
              transcript: details.transcript
            } : call
          )
        )
      }
    } catch (error) {
      console.error('Error fetching call details:', error)
    }
    setAnalyzingCall(null)
  }

  const archiveCall = async (callId) => {
    if (confirm('Archive this call? It will be hidden from the main list.')) {
      try {
        const response = await fetch(`${API_URL}/api/calls/${callId}/archive`, {
          method: 'PUT'
        })
        
        if (response.ok) {
          setCalls(prevCalls => prevCalls.filter(call => call.id !== callId))
        } else {
          alert('Failed to archive call')
        }
      } catch (error) {
        console.error('Error archiving call:', error)
        alert('Failed to archive call')
      }
    }
  }

  const deleteCall = async (callId) => {
    if (confirm('Are you sure you want to permanently delete this call?')) {
      try {
        const response = await fetch(`${API_URL}/api/calls/${callId}`, {
          method: 'DELETE'
        })
        
        if (response.ok) {
          setCalls(prevCalls => prevCalls.filter(call => call.id !== callId))
        } else {
          alert('Failed to delete call')
        }
      } catch (error) {
        console.error('Error deleting call:', error)
        alert('Failed to delete call')
      }
    }
  }

  const toggleCallSelection = (callId) => {
    setSelectedCalls(prev => {
      const newSet = new Set(prev)
      if (newSet.has(callId)) {
        newSet.delete(callId)
      } else {
        newSet.add(callId)
      }
      return newSet
    })
  }

  const selectAllCalls = () => {
    if (selectedCalls.size === calls.length) {
      setSelectedCalls(new Set()) // Deselect all
    } else {
      setSelectedCalls(new Set(calls.map(call => call.id))) // Select all
    }
  }

  const bulkDeleteCalls = async () => {
    if (selectedCalls.size === 0) return
    
    if (confirm(`Are you sure you want to permanently delete ${selectedCalls.size} selected calls?`)) {
      try {
        const callIds = Array.from(selectedCalls)
        
        const response = await fetch(`${API_URL}/api/calls/bulk-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ call_ids: callIds })
        })
        
        if (response.ok) {
          setCalls(prevCalls => prevCalls.filter(call => !selectedCalls.has(call.id)))
          setSelectedCalls(new Set())
          setBulkMode(false)
          alert(`Successfully deleted ${callIds.length} calls`)
        } else {
          alert('Failed to delete some calls')
        }
      } catch (error) {
        console.error('Error bulk deleting calls:', error)
        alert('Failed to delete calls')
      }
    }
  }

  const bulkArchiveCalls = () => {
    if (selectedCalls.size === 0) return
    
    if (confirm(`Archive ${selectedCalls.size} selected calls?`)) {
      setCalls(prevCalls => prevCalls.filter(call => !selectedCalls.has(call.id)))
      setSelectedCalls(new Set())
      setBulkMode(false)
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
        <div className="flex items-center space-x-2">
          {!bulkMode ? (
            <>
              <button 
                onClick={() => setBulkMode(true)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Select Multiple
              </button>
              <button 
                onClick={fetchCalls}
                className="px-4 py-2 bg-coral text-white rounded-lg hover:bg-coral-dark transition-colors"
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-600">
                {selectedCalls.size} selected
              </span>
              <button 
                onClick={selectAllCalls}
                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors"
              >
                {selectedCalls.size === calls.length ? 'Deselect All' : 'Select All'}
              </button>
              <button 
                onClick={bulkArchiveCalls}
                disabled={selectedCalls.size === 0}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Archive ({selectedCalls.size})
              </button>
              <button 
                onClick={bulkDeleteCalls}
                disabled={selectedCalls.size === 0}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors disabled:opacity-50"
              >
                Delete ({selectedCalls.size})
              </button>
              <button 
                onClick={() => {setBulkMode(false); setSelectedCalls(new Set())}}
                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
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
            <div key={call.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Call Card Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => bulkMode ? toggleCallSelection(call.id) : toggleCallExpansion(call)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {bulkMode && (
                      <div 
                        className="p-2 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); toggleCallSelection(call.id); }}
                      >
                        {selectedCalls.has(call.id) ? (
                          <div className="w-5 h-5 bg-coral text-white rounded flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    )}
                    <div className="p-2 bg-cream rounded-lg">
                      <Phone className="w-5 h-5 text-coral" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-navy">
                          {analyzingCall === call.id ? 'Loading...' : call.callerName}
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
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{formatTime(call.timestamp)}</p>
                      <p className="text-sm text-gray-400 mt-1">
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

              {/* Expanded Details */}
              {expandedCall === call.id && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  {analyzingCall === call.id ? (
                    <div className="text-center py-8">
                      <div className="text-gray-500">Loading transcript...</div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Call Summary */}
                      {call.analysis && (
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
                      )}

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
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Calls