import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Bot, Calendar, MapPin, DollarSign, Home, Trash2 } from 'lucide-react'

function CallsSimple() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedCall, setExpandedCall] = useState(null)
  const [callDetails, setCallDetails] = useState({})
  const [analyzingCall, setAnalyzingCall] = useState(null)
  const [selectedCalls, setSelectedCalls] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

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
      
      // Enhanced demo data showing different call types
      setCalls([
        {
          id: 'demo-hot-lead',
          tenant_id: 'Ray Richards',
          caller_number: '+1 (555) 123-4567',
          caller_name: 'Sarah Johnson',
          agent_number: '+13168670416',
          started_at: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
          ended_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
          outcome: 'showing_scheduled',
          summary: 'Hot lead - Property showing scheduled for Oak Avenue home',
          status: 'completed',
          lead_quality: 'hot',
          call_type: 'property_inquiry',
          caller_city: 'Austin',
          caller_state: 'TX'
        },
        {
          id: 'demo-listing-consult',
          tenant_id: 'Ray Richards',
          caller_number: '+1 (555) 987-6543',
          caller_name: 'Mike Chen',
          agent_number: '+13168670416',
          started_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
          ended_at: new Date(Date.now() - 6900000).toISOString(),
          outcome: 'callback_scheduled',
          summary: 'Listing consultation - wants to sell family home',
          status: 'completed',
          lead_quality: 'warm',
          call_type: 'listing_consultation',
          caller_city: 'Cedar Park',
          caller_state: 'TX'
        },
        {
          id: 'demo-general-service',
          tenant_id: 'Ray Richards',
          caller_number: '+1 (555) 456-7890',
          agent_number: '+13168670416',
          started_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
          ended_at: new Date(Date.now() - 86100000).toISOString(),
          outcome: 'information_provided',
          summary: 'Market analysis inquiry for Round Rock area',
          status: 'completed',
          lead_quality: 'cold',
          call_type: 'general_service',
          caller_city: 'Round Rock',
          caller_state: 'TX'
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
    // Use call_status field, fallback to ended_at check
    const status = call.call_status || (call.ended_at ? 'completed' : 'in_progress')
    switch (status) {
      case 'in_progress': return <Phone className="h-4 w-4 text-green-500" />
      case 'completed': return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      case 'missed': return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (call) => {
    // Use call_status field, fallback to ended_at check  
    const status = call.call_status || (call.ended_at ? 'completed' : 'in_progress')
    switch (status) {
      case 'in_progress': return 'bg-green-50 text-green-700 border-green-200'
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'failed': return 'bg-red-50 text-red-700 border-red-200'
      case 'missed': return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const getStatusLabel = (call) => {
    const status = call.call_status || (call.ended_at ? 'completed' : 'in_progress')
    switch (status) {
      case 'in_progress': return 'Active'
      case 'completed': return 'Completed' 
      case 'failed': return 'Failed'
      case 'missed': return 'Missed'
      default: return 'Unknown'
    }
  }

  const formatPhoneNumber = (phone) => {
    if (!phone) return 'Unknown Number'
    
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '')
    
    // Format as (XXX) XXX-XXXX
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // Remove leading 1
      const withoutCountry = cleaned.slice(1)
      return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3, 6)}-${withoutCountry.slice(6)}`
    } else if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    
    return phone // Return original if can't format
  }

  const getCallPreviewInfo = (call) => {
    // Extract useful info for collapsed state
    let preview = {
      title: `Call from ${formatPhoneNumber(call.caller_number)}`,
      subtitle: '',
      badges: []
    }

    // Add caller name if available
    if (call.caller_name && call.caller_name !== 'null') {
      preview.title = `${call.caller_name} • ${formatPhoneNumber(call.caller_number)}`
    }

    // Add location if available
    if (call.caller_city && call.caller_state) {
      preview.subtitle = `${call.caller_city}, ${call.caller_state}`
    }

    // Add outcome/result info
    if (call.outcome && call.outcome !== 'unknown') {
      const outcomeLabels = {
        'showing_scheduled': '📅 Showing Scheduled',
        'callback_scheduled': '📞 Callback Requested', 
        'information_provided': '💡 Info Provided',
        'lead_captured': '🎯 Lead Captured',
        'property_inquiry': '🏠 Property Interest',
        'listing_consultation': '📋 Listing Consult'
      }
      preview.badges.push(outcomeLabels[call.outcome] || call.outcome)
    }

    // Add call type
    if (call.call_type && call.call_type !== 'unknown') {
      const typeLabels = {
        'property_inquiry': '🏠 Property Search',
        'listing_consultation': '📋 Listing',
        'callback_request': '📞 Callback',
        'general_service': '💬 General',
        'investment': '💰 Investment'
      }
      if (!preview.badges.some(badge => badge.includes('Property') || badge.includes('Listing'))) {
        preview.badges.push(typeLabels[call.call_type] || call.call_type.replace('_', ' '))
      }
    }

    return preview
  }


  // Process transcript entries to merge consecutive messages and ensure chronological order
  const processTranscriptEntries = (entries) => {
    if (!entries || entries.length === 0) return []
    
    // Sort by timestamp first
    const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    
    // Merge consecutive messages from the same speaker
    const merged = []
    let currentMessage = null
    
    for (const entry of sorted) {
      if (currentMessage && currentMessage.speaker === entry.speaker) {
        // Same speaker - merge messages with a space
        currentMessage.message += ' ' + entry.message
        // Keep the later timestamp
        currentMessage.timestamp = entry.timestamp
      } else {
        // Different speaker or first message - start new message
        if (currentMessage) {
          merged.push(currentMessage)
        }
        currentMessage = { ...entry }
      }
    }
    
    // Don't forget the last message
    if (currentMessage) {
      merged.push(currentMessage)
    }
    
    return merged
  }

  const generateAnalysis = async (callId) => {
    try {
      setAnalyzingCall(callId);
      console.log(`Generating analysis for call ${callId}`);
      
      const analysisResponse = await fetch(`http://localhost:8000/api/calls/${callId}/analyze`);
      
      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        console.log('Generated fresh analysis:', analysisData.analysis);
        
        // Update the call details with new analysis
        setCallDetails(prev => ({
          ...prev,
          [callId]: {
            ...prev[callId],
            analysis: analysisData.analysis
          }
        }));
      } else {
        console.error('Analysis generation failed:', analysisResponse.status);
      }
    } catch (error) {
      console.error('Error generating analysis:', error);
    } finally {
      setAnalyzingCall(null);
    }
  };

  const deleteCall = async (callId) => {
    if (!window.confirm('Are you sure you want to delete this call? This action cannot be undone.')) {
      return;
    }

    try {
      console.log(`Deleting call ${callId}`);
      const response = await fetch(`http://localhost:8000/api/calls/${callId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove from local state
        setCalls(prev => prev.filter(call => call.id !== callId));
        setCallDetails(prev => {
          const updated = { ...prev };
          delete updated[callId];
          return updated;
        });
        // Close expansion if this call was expanded
        if (expandedCall === callId) {
          setExpandedCall(null);
        }
        console.log(`Call ${callId} deleted successfully`);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        alert(`Failed to delete call: ${errorData.detail || response.statusText}`);
        console.error('Delete failed:', response.status, errorData);
      }
    } catch (error) {
      console.error('Error deleting call:', error);
      alert('Failed to delete call. Please try again.');
    }
  };

  const toggleCallSelection = (callId) => {
    const newSelected = new Set(selectedCalls);
    if (newSelected.has(callId)) {
      newSelected.delete(callId);
    } else {
      newSelected.add(callId);
    }
    setSelectedCalls(newSelected);
  };

  const selectAllCalls = () => {
    if (selectedCalls.size === calls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(calls.map(call => call.id)));
    }
  };

  const bulkDeleteCalls = async () => {
    if (selectedCalls.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedCalls.size} call(s)? This action cannot be undone.`)) {
      return;
    }

    setBulkDeleting(true);
    
    try {
      const response = await fetch('http://localhost:8000/api/calls/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          call_ids: Array.from(selectedCalls)
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Bulk delete result:', result);
        
        // Remove deleted calls from UI
        setCalls(prev => prev.filter(call => !selectedCalls.has(call.id)));
        setCallDetails(prev => {
          const updated = { ...prev };
          selectedCalls.forEach(callId => delete updated[callId]);
          return updated;
        });
        setSelectedCalls(new Set());
        setExpandedCall(null);
        
        alert(`Successfully deleted ${result.deleted_count} call(s)`);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        alert(`Failed to delete calls: ${errorData.detail || response.statusText}`);
        console.error('Bulk delete failed:', response.status, errorData);
      }
      
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Failed to delete calls. Please try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

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
        
        // Fetch both call details and transcript data
        const [callResponse, transcriptResponse] = await Promise.all([
          fetch(`http://localhost:8000/api/calls/${call.id}`),
          fetch(`http://localhost:8000/api/calls/${call.id}/transcript`)
        ])
        
        if (callResponse.ok && transcriptResponse.ok) {
          const [callData, transcriptData] = await Promise.all([
            callResponse.json(),
            transcriptResponse.json()
          ])
          
          console.log('Call details:', callData)
          console.log('Transcript data:', transcriptData)
          
          // Try to get analysis if available
          let analysis = null;
          if (callData.call?.ai_response) {
            try {
              analysis = JSON.parse(callData.call.ai_response);
            } catch (e) {
              console.log('Could not parse analysis from ai_response');
            }
          }
          
          // If no analysis, trigger it
          if (!analysis) {
            try {
              console.log(`Triggering analysis for call ${call.id}`);
              setAnalyzingCall(call.id);
              
              const analysisResponse = await fetch(`http://localhost:8000/api/calls/${call.id}/analyze`);
              
              if (analysisResponse.ok) {
                const analysisData = await analysisResponse.json();
                analysis = analysisData.analysis;
                console.log('Generated fresh analysis:', analysis);
              }
            } catch (error) {
              console.log('Analysis generation failed:', error);
            } finally {
              setAnalyzingCall(null);
            }
          }
          
          // Process transcript entries to merge consecutive messages and sort chronologically
          const processedEntries = processTranscriptEntries(transcriptData.entries || [])
          
          setCallDetails(prev => ({
            ...prev,
            [call.id]: {
              turns: callData.turns || [],
              transcript: transcriptData.transcript || 'No transcript available',
              summary: callData.call?.summary || analysis?.call_summary || 'Call in progress...',
              analysis: analysis,
              transcript_entries: processedEntries
            }
          }))
        } else {
          // Mock details for demo - different for each call type
          let mockData = {};
          
          if (call.id === 'demo-hot-lead') {
            mockData = {
              turns: [
                { type: 'turn', role: 'user', text: 'Hi there, I\'m looking for a 3-bedroom home in Austin with a budget around $500k', ts: call.started_at },
                { type: 'tool_call', tool_name: 'search_properties', tool_args: { city: 'Austin', beds: 3, max_price: 500000 }, ts: call.started_at },
                { type: 'tool_result', tool_name: 'search_properties', tool_result: { data: { results: [
                  { address: '123 Main St, Austin TX', price: 489000, beds: 3, baths: 2, sqft: 1800, status: 'active' },
                  { address: '456 Oak Avenue, Austin TX', price: 475000, beds: 3, baths: 2.5, sqft: 1950, status: 'active' }
                ] } }, ts: call.started_at },
                { type: 'turn', role: 'assistant', text: 'Great! I found 2 excellent properties in your budget. There\'s a beautiful 3-bedroom home at 123 Main Street for $489,000 with 1,800 square feet, and another at 456 Oak Avenue for $475,000 with 1,950 square feet. Both have 2+ bathrooms. Would you like me to schedule a showing for either of these?', ts: call.started_at },
                { type: 'turn', role: 'user', text: 'Yes, I\'m very interested in the Oak Avenue property. My name is Sarah Johnson and I can be reached at this number. When can we schedule a viewing?', ts: call.started_at },
                { type: 'turn', role: 'assistant', text: 'Perfect Sarah! I\'ll have our agent contact you within the next hour to schedule a showing for 456 Oak Avenue. Is there anything specific you\'d like to know about the property before your visit?', ts: call.started_at },
                { type: 'turn', role: 'user', text: 'Does it have a garage and is the neighborhood family-friendly?', ts: call.started_at },
                { type: 'turn', role: 'assistant', text: 'Excellent questions! This property includes a 2-car garage and is located in a very family-friendly neighborhood with top-rated schools nearby. You\'ll love the area. Our agent will provide more details when they call you shortly!', ts: call.started_at }
              ],
              transcript: 'User: Hi there, I\'m looking for a 3-bedroom home in Austin with a budget around $500k\nCORA: Great! I found 2 excellent properties in your budget...',
              summary: 'High-quality lead - Sarah Johnson interested in 456 Oak Avenue property, requesting showing',
              transcript_entries: [
                { speaker: 'user', message: 'Hi there, I\'m looking for a 3-bedroom home in Austin with a budget around $500k', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Great! I found 2 excellent properties in your budget. There\'s a beautiful 3-bedroom home at 123 Main Street for $489,000 with 1,800 square feet, and another at 456 Oak Avenue for $475,000 with 1,950 square feet. Both have 2+ bathrooms. Would you like me to schedule a showing for either of these?', timestamp: call.started_at },
                { speaker: 'user', message: 'Yes, I\'m very interested in the Oak Avenue property. My name is Sarah Johnson and I can be reached at this number. When can we schedule a viewing?', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Perfect Sarah! I\'ll have our agent contact you within the next hour to schedule a showing for 456 Oak Avenue. Is there anything specific you\'d like to know about the property before your visit?', timestamp: call.started_at },
                { speaker: 'user', message: 'Does it have a garage and is the neighborhood family-friendly?', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Excellent questions! This property includes a 2-car garage and is located in a very family-friendly neighborhood with top-rated schools nearby. You\'ll love the area. Our agent will provide more details when they call you shortly!', timestamp: call.started_at }
              ],
              analysis: {
                caller_name: 'Sarah Johnson',
                phone_number: '+13162187747',
                call_type: 'property_inquiry',
                property_interests: ['456 Oak Avenue, Austin TX'],
                budget_mentioned: 500000,
                bedrooms_wanted: 3,
                timeline: 'immediate',
                scheduling_requests: 'Property showing requested',
                callback_requested: true,
                lead_quality: 'hot',
                call_summary: 'Sarah Johnson called looking for a 3-bedroom home in Austin with a $500k budget. CORA found two suitable properties and Sarah expressed strong interest in 456 Oak Avenue, providing her name and requesting an immediate showing. High-quality lead with clear intent to purchase.',
                key_highlights: [
                  'Caller provided full name and contact information',
                  'Strong interest in specific property (456 Oak Avenue)',
                  'Requested immediate showing - ready to view property',
                  'Asked detailed questions about garage and neighborhood'
                ],
                next_actions: [
                  'Contact Sarah Johnson within 1 hour to schedule showing',
                  'Prepare property details and comparable sales for 456 Oak Avenue',
                  'Send neighborhood information and school ratings',
                  'Follow up after showing with additional property options'
                ],
                interest_level: 'very_high',
                urgency: 'immediate'
              }
            }
          } else if (call.id === 'demo-listing-consult') {
            mockData = {
              transcript_entries: [
                { speaker: 'user', message: 'Hi, I\'m interested in listing my home. Can you help me understand the current market?', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Absolutely! I\'d be happy to help you with listing your home. Can you tell me the address and some details about your property?', timestamp: call.started_at },
                { speaker: 'user', message: 'It\'s a 4-bedroom, 3-bathroom house in Cedar Park. About 2,400 square feet. My name is Mike Chen.', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Thanks Mike! Cedar Park is a great market right now. For a 4-bedroom home of that size, I\'ll have our listing agent do a comprehensive market analysis and contact you within 24 hours with pricing recommendations and our marketing strategy.', timestamp: call.started_at }
              ],
              analysis: {
                caller_name: 'Mike Chen',
                call_type: 'listing_consultation',
                property_interests: ['Cedar Park home listing'],
                lead_quality: 'warm',
                call_summary: 'Mike Chen wants to list his 4-bedroom Cedar Park home. Requested market analysis and agent consultation.',
                key_highlights: [
                  'Homeowner ready to list 4BR/3BA property',
                  'Cedar Park location - strong market area',
                  '2,400 sqft home with good specifications'
                ],
                next_actions: [
                  'Schedule in-person listing consultation with Mike Chen',
                  'Prepare Cedar Park market analysis and comparable sales',
                  'Contact within 24 hours as promised'
                ],
                callback_requested: true,
                timeline: 'this_month'
              }
            }
          } else {
            // General service call
            mockData = {
              transcript_entries: [
                { speaker: 'user', message: 'Hi, I\'m thinking about buying in the Round Rock area. What\'s the market like right now?', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Round Rock is an excellent area with strong property values and great schools. Are you looking for a primary residence or investment property?', timestamp: call.started_at },
                { speaker: 'user', message: 'Primary residence. Just getting started with my research.', timestamp: call.started_at },
                { speaker: 'assistant', message: 'Perfect! I can send you our Round Rock market report and new listing alerts. When you\'re ready to start viewing homes, our agents would be happy to help you find the perfect property.', timestamp: call.started_at }
              ],
              analysis: {
                call_type: 'general_service',
                lead_quality: 'cold',
                call_summary: 'General market inquiry for Round Rock area. Early-stage buyer doing initial research.',
                key_highlights: [
                  'Interested in Round Rock market information',
                  'Looking for primary residence',
                  'Early research phase'
                ],
                next_actions: [
                  'Send Round Rock market report',
                  'Add to buyer newsletter list',
                  'Follow up in 2-3 weeks'
                ]
              }
            }
          }
          
          setCallDetails(prev => ({
            ...prev,
            [call.id]: mockData
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
          {selectedCalls.size > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">
                {selectedCalls.size} selected
              </span>
              <button
                onClick={bulkDeleteCalls}
                disabled={bulkDeleting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 flex items-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>{bulkDeleting ? 'Deleting...' : `Delete ${selectedCalls.size}`}</span>
              </button>
            </div>
          )}
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

      {/* Bulk Selection Controls */}
      {calls.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCalls.size === calls.length && calls.length > 0}
                onChange={selectAllCalls}
                className="rounded border-gray-300 text-coral focus:ring-coral"
              />
              <span className="text-sm text-gray-700">
                {selectedCalls.size === calls.length && calls.length > 0 ? 'Deselect all' : 'Select all'}
              </span>
            </label>
            {selectedCalls.size > 0 && (
              <span className="text-sm text-coral font-medium">
                {selectedCalls.size} of {calls.length} calls selected
              </span>
            )}
          </div>
          
          {selectedCalls.size > 0 && (
            <button
              onClick={() => setSelectedCalls(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Error: {error}</p>
          <p className="text-sm text-red-500 mt-1">Showing fallback data</p>
        </div>
      )}

      {/* Calls List */}
      <div className="max-w-4xl mx-auto">
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
                  {/* Selection Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedCalls.has(call.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleCallSelection(call.id);
                    }}
                    className="rounded border-gray-300 text-coral focus:ring-coral"
                  />
                  {getStatusIcon(call)}
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-semibold text-gray-900 hover:text-coral transition">
                        {getCallPreviewInfo(call).title}
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
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">
                        {new Date(call.started_at).toLocaleString()}
                      </p>
                      {getCallPreviewInfo(call).subtitle && (
                        <p className="text-xs text-gray-500">
                          📍 {getCallPreviewInfo(call).subtitle}
                        </p>
                      )}
                      {getCallPreviewInfo(call).badges.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {getCallPreviewInfo(call).badges.map((badge, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(call)}`}>
                    {getStatusLabel(call)}
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
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCall(call.id);
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete call"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  
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
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <MessageSquare className="h-4 w-4" />
                      <span>Click to view full conversation & AI analysis</span>
                    </div>
                    {call.summary && (
                      <div className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded max-w-xs truncate">
                        {call.summary}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    ID: {call.twilio_sid?.substring(0, 8) || call.id.substring(0, 8)}...
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedCall === call.id && (
              <div className="border-t border-gray-200 bg-gray-50 p-6">
                {callDetails[call.id] ? (
                  <div className="space-y-4">
                    {/* AI-Generated Call Summary */}
                    {callDetails[call.id].analysis ? (
                      <div>
                        <div className="flex items-center space-x-2 mb-3">
                          <Bot className="h-5 w-5 text-coral" />
                          <h4 className="font-semibold text-navy">AI Call Analysis</h4>
                        </div>
                        
                        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                          {/* Call Type & Lead Quality Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                callDetails[call.id].analysis.call_type === 'property_inquiry' ? 'bg-green-100 text-green-700' :
                                callDetails[call.id].analysis.call_type === 'listing_consultation' ? 'bg-blue-100 text-blue-700' :
                                callDetails[call.id].analysis.call_type === 'callback_request' ? 'bg-purple-100 text-purple-700' :
                                callDetails[call.id].analysis.call_type === 'investment' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {callDetails[call.id].analysis.call_type?.replace('_', ' ') || 'general inquiry'}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                callDetails[call.id].analysis.lead_quality === 'hot' ? 'bg-red-100 text-red-700 border border-red-200' :
                                callDetails[call.id].analysis.lead_quality === 'warm' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                'bg-blue-100 text-blue-700 border border-blue-200'
                              }`}>
                                🔥 {callDetails[call.id].analysis.lead_quality?.toUpperCase()} LEAD
                              </span>
                            </div>
                            {callDetails[call.id].analysis.callback_requested && (
                              <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-700 border border-orange-200">
                                📞 Callback Requested
                              </span>
                            )}
                          </div>
                          
                          {/* Call Summary */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-sm text-gray-800 leading-relaxed">{callDetails[call.id].analysis.call_summary}</p>
                          </div>
                          
                          {/* Key Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left Column */}
                            <div className="space-y-3">
                              {callDetails[call.id].analysis.caller_name && (
                                <div className="flex items-center space-x-2 text-sm">
                                  <User className="h-4 w-4 text-gray-500" />
                                  <span className="font-medium">{callDetails[call.id].analysis.caller_name}</span>
                                </div>
                              )}
                              
                              {callDetails[call.id].analysis.budget_mentioned && (
                                <div className="flex items-center space-x-2 text-sm">
                                  <DollarSign className="h-4 w-4 text-green-500" />
                                  <span>Budget: <span className="font-medium">${callDetails[call.id].analysis.budget_mentioned.toLocaleString()}</span></span>
                                </div>
                              )}
                              
                              {callDetails[call.id].analysis.bedrooms_wanted && (
                                <div className="flex items-center space-x-2 text-sm">
                                  <Home className="h-4 w-4 text-blue-500" />
                                  <span><span className="font-medium">{callDetails[call.id].analysis.bedrooms_wanted}</span> bedrooms</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Right Column */}
                            <div className="space-y-3">
                              {callDetails[call.id].analysis.timeline && (
                                <div className="flex items-center space-x-2 text-sm">
                                  <Calendar className="h-4 w-4 text-purple-500" />
                                  <span>Timeline: <span className="font-medium">{callDetails[call.id].analysis.timeline}</span></span>
                                </div>
                              )}
                              
                              {callDetails[call.id].analysis.service_requested && (
                                <div className="flex items-center space-x-2 text-sm">
                                  <MessageSquare className="h-4 w-4 text-coral" />
                                  <span>Service: <span className="font-medium">{callDetails[call.id].analysis.service_requested}</span></span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Property Interests */}
                          {callDetails[call.id].analysis.property_interests?.length > 0 && (
                            <div>
                              <div className="flex items-center space-x-2 mb-2">
                                <MapPin className="h-4 w-4 text-coral" />
                                <p className="text-sm font-medium text-gray-700">Properties of Interest:</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {callDetails[call.id].analysis.property_interests.map((property, idx) => (
                                  <span key={idx} className="px-2 py-1 bg-coral/10 text-coral text-xs rounded border border-coral/20">
                                    {property}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Key Highlights */}
                          {callDetails[call.id].analysis.key_highlights?.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2">Key Discussion Points:</p>
                              <ul className="space-y-2">
                                {callDetails[call.id].analysis.key_highlights.map((highlight, idx) => (
                                  <li key={idx} className="flex items-start space-x-2">
                                    <span className="w-1.5 h-1.5 bg-coral rounded-full mt-2 flex-shrink-0"></span>
                                    <span className="text-sm text-gray-700">{highlight}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {/* Next Actions */}
                          {callDetails[call.id].analysis.next_actions?.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-green-700 mb-2">Recommended Follow-up Actions:</p>
                              <ul className="space-y-2">
                                {callDetails[call.id].analysis.next_actions.map((action, idx) => (
                                  <li key={idx} className="flex items-start space-x-2">
                                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span className="text-sm text-green-700">{action}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-navy">Call Summary</h4>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              generateAnalysis(call.id);
                            }}
                            disabled={analyzingCall === call.id}
                            className="px-3 py-1 bg-coral text-white rounded text-xs hover:bg-coral/80 transition-colors disabled:opacity-50"
                          >
                            {analyzingCall === call.id ? 'Analyzing...' : 'Generate AI Analysis'}
                          </button>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {callDetails[call.id].summary}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Full Conversation Transcript */}
                    <div>
                      <div className="flex items-center space-x-2 mb-3">
                        <MessageSquare className="h-5 w-5 text-coral" />
                        <h4 className="font-semibold text-navy">Full Conversation</h4>
                        {callDetails[call.id].transcript_entries?.length > 0 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            {callDetails[call.id].transcript_entries.length} messages
                          </span>
                        )}
                      </div>
                      
                      <div className="bg-white rounded-lg border border-gray-200 p-4 max-h-80 overflow-y-auto">
                        {callDetails[call.id].transcript_entries?.length > 0 ? (
                          <div className="space-y-4">
                            {callDetails[call.id].transcript_entries.map((entry, idx) => (
                              <div key={idx} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className="max-w-[75%]">
                                  {/* Speaker Label */}
                                  <div className={`flex items-center space-x-2 mb-1 ${
                                    entry.speaker === 'user' ? 'justify-end' : 'justify-start'
                                  }`}>
                                    {entry.speaker === 'user' ? (
                                      <>
                                        <span className="text-xs text-blue-500 font-medium">Caller</span>
                                        <User className="h-3 w-3 text-blue-500" />
                                      </>
                                    ) : (
                                      <>
                                        <Bot className="h-3 w-3 text-coral" />
                                        <span className="text-xs text-coral font-medium">CORA</span>
                                      </>
                                    )}
                                  </div>
                                  
                                  {/* Message Bubble */}
                                  <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                                    entry.speaker === 'user'
                                      ? 'bg-blue-500 text-white rounded-br-md' 
                                      : 'bg-coral text-white rounded-bl-md'
                                  }`}>
                                    <p className="text-sm leading-relaxed">{entry.message}</p>
                                  </div>
                                  
                                  {/* Timestamp */}
                                  <p className={`text-xs text-gray-400 mt-1 ${
                                    entry.speaker === 'user' ? 'text-right' : 'text-left'
                                  }`}>
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500 text-sm">No transcript available yet</p>
                            <p className="text-gray-400 text-xs">Transcript will appear here during the call</p>
                          </div>
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
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral mx-auto mb-3"></div>
                    <p className="text-sm text-gray-500">Loading call details...</p>
                    {analyzingCall === call.id && (
                      <p className="text-xs text-coral mt-1">Generating AI analysis...</p>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
        </div>
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