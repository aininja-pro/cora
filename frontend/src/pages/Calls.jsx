import { useState, useEffect } from 'react'
import { Phone, Clock, MessageSquare, ChevronDown, ChevronUp, Archive, Trash2, Check, Square, User, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCalls } from '../hooks/useCalls'

function Calls() {
  const { calls, loading, error, refetch } = useCalls('Ray Richards')
  const [selectedCalls, setSelectedCalls] = useState(new Set())
  const [bulkMode, setBulkMode] = useState(false)

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

  const getCallStatus = (call) => {
    if (call.ended_at) return 'completed'
    return 'active'
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700 border-green-200'
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'failed': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
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
    
    // Analyze if no stored analysis
    if (!call.analysis && !call.hasStoredAnalysis) {
      await analyzeCall(call.id)
    }
  }

  const analyzeCall = async (callId) => {
    setAnalyzingCall(callId)
    try {
      const response = await fetch(`${API_URL}/api/calls/${callId}/analyze`)
      const analysis = await response.json()
      
      if (analysis.success) {
        // Update the call with analysis results AND extracted info
        setCalls(prevCalls => 
          prevCalls.map(call => 
            call.id === callId ? {
              ...call,
              callerName: analysis.analysis.caller_name || call.callerName,
              property: analysis.analysis.call_type === 'listing_consultation' ? 'Listing Consultation' :
                       analysis.analysis.call_type === 'callback_request' ? 'Callback Request' :
                       analysis.analysis.call_type === 'general_service' ? 'General Service' :
                       analysis.analysis.property_interests?.length > 0 ? 
                       analysis.analysis.property_interests[0] : 'Service Request',
              leadScore: analysis.analysis.lead_quality === 'hot' ? 'Hot' : 
                        analysis.analysis.lead_quality === 'warm' ? 'Warm' : 'Cold',
              analysis: analysis.analysis,
              hasStoredAnalysis: true
            } : call
          )
        )
      }
    } catch (error) {
      console.error('Error analyzing call:', error)
    }
    setAnalyzingCall(null)
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
                onClick={() => bulkMode ? toggleCallSelection(call.id) : null}
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
                        <Link 
                          to={`/calls/${call.id}`}
                          className="font-semibold text-navy hover:text-coral transition"
                        >
                          {call.caller_number || 'Unknown Caller'}
                        </Link>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(getCallStatus(call))}`}>
                          {getCallStatus(call)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{new Date(call.started_at).toLocaleString()}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Duration: <span className="font-medium">{formatDuration(call.started_at, call.ended_at)}</span>
                        {call.outcome && (
                          <span className="ml-2">• Outcome: <span className="font-medium">{call.outcome}</span></span>
                        )}
                      </p>
                      {!call.hasStoredAnalysis && !bulkMode && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); analyzeCall(call.id); }}
                          className="mt-2 px-2 py-1 bg-coral text-white rounded text-xs hover:bg-coral-dark transition-colors"
                        >
                          {analyzingCall === call.id ? 'Analyzing...' : 'Analyze'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{formatTime(call.timestamp)}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {formatDuration(call.started_at, call.ended_at)}
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
                      {call.analysis ? (
                        <div>
                          <h4 className="font-medium text-navy mb-2">Call Summary</h4>
                          <div className="bg-white rounded-lg p-3 text-sm">
                            <div className="flex items-center mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium mr-2 ${
                                call.analysis.call_type === 'listing_consultation' ? 'bg-green-100 text-green-700' :
                                call.analysis.call_type === 'callback_request' ? 'bg-blue-100 text-blue-700' :
                                call.analysis.call_type === 'general_service' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {call.analysis.call_type?.replace('_', ' ') || 'property inquiry'}
                              </span>
                              {call.analysis.callback_requested && (
                                <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-700">
                                  Callback Requested
                                </span>
                              )}
                            </div>
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
                      ) : (
                        <div className="text-center py-6">
                          <div className="text-gray-500 mb-3">No analysis available</div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); analyzeCall(call.id); }}
                            className="px-4 py-2 bg-coral text-white rounded-lg text-sm hover:bg-coral-dark transition-colors"
                          >
                            Analyze with GPT
                          </button>
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