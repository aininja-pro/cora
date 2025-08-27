import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Phone, Clock, User, ArrowLeft, MessageSquare, 
  Search, Calendar, PhoneCall, UserCheck, Settings,
  MapPin, DollarSign, Bed, Bath, Square as SquareIcon
} from 'lucide-react'
import { useCallDetail } from '../hooks/useCalls'

function CallDetail() {
  const { callId } = useParams()
  const { call, turns, loading, error, refetch } = useCallDetail(callId)

  const formatTimestamp = (ts) => {
    return new Date(ts).toLocaleTimeString()
  }

  const getEventIcon = (turn) => {
    switch (turn.type) {
      case 'turn':
        return turn.role === 'user' ? 
          <User className="h-4 w-4 text-blue-500" /> : 
          <MessageSquare className="h-4 w-4 text-coral" />
      case 'tool_call':
        switch (turn.tool_name) {
          case 'search_properties': return <Search className="h-4 w-4 text-green-500" />
          case 'book_showing': return <Calendar className="h-4 w-4 text-purple-500" />
          case 'qualify_lead': return <UserCheck className="h-4 w-4 text-orange-500" />
          case 'request_callback': return <PhoneCall className="h-4 w-4 text-blue-500" />
          case 'transfer_to_human': return <Settings className="h-4 w-4 text-red-500" />
          default: return <Settings className="h-4 w-4 text-gray-500" />
        }
      case 'tool_result':
        return <MessageSquare className="h-4 w-4 text-gray-500" />
      case 'status':
        return <Settings className="h-4 w-4 text-gray-400" />
      case 'summary':
        return <MessageSquare className="h-4 w-4 text-navy" />
      default:
        return <MessageSquare className="h-4 w-4 text-gray-400" />
    }
  }

  const renderPropertyCard = (properties) => {
    if (!properties || !Array.isArray(properties)) return null

    return (
      <div className="mt-3 space-y-2">
        {properties.slice(0, 3).map((property) => (
          <div key={property.id} className="bg-gray-50 rounded-lg p-3 border">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-medium text-navy text-sm">{property.address}</h4>
                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-600">
                  <div className="flex items-center space-x-1">
                    <DollarSign className="h-3 w-3" />
                    <span>${property.price?.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Bed className="h-3 w-3" />
                    <span>{property.beds}br</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Bath className="h-3 w-3" />
                    <span>{property.baths}ba</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <SquareIcon className="h-3 w-3" />
                    <span>{property.sqft?.toLocaleString()} sqft</span>
                  </div>
                </div>
              </div>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                {property.status}
              </span>
            </div>
          </div>
        ))}
        {properties.length > 3 && (
          <p className="text-xs text-gray-500 text-center">
            +{properties.length - 3} more properties
          </p>
        )}
      </div>
    )
  }

  const renderTimelineEvent = (turn) => {
    const isUser = turn.role === 'user'
    const isAssistant = turn.role === 'assistant'
    
    return (
      <div key={turn.id} className="flex items-start space-x-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          {getEventIcon(turn)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {turn.type === 'turn' && isUser && 'Caller'}
              {turn.type === 'turn' && isAssistant && 'CORA'}
              {turn.type === 'tool_call' && `Tool: ${turn.tool_name}`}
              {turn.type === 'tool_result' && `Result: ${turn.tool_name}`}
              {turn.type === 'status' && 'Status'}
              {turn.type === 'summary' && 'Call Summary'}
            </p>
            <p className="text-xs text-gray-500">
              {formatTimestamp(turn.ts)}
            </p>
          </div>
          
          {/* Event Content */}
          <div className="mt-1">
            {turn.text && (
              <p className={`text-sm ${isUser ? 'text-gray-700' : isAssistant ? 'text-navy' : 'text-gray-600'}`}>
                {turn.text}
              </p>
            )}
            
            {/* Tool Arguments */}
            {turn.type === 'tool_call' && turn.tool_args && (
              <div className="mt-2 bg-blue-50 rounded p-2">
                <p className="text-xs text-blue-700 font-medium">Search criteria:</p>
                <p className="text-xs text-blue-600">
                  {JSON.stringify(turn.tool_args, null, 2)}
                </p>
              </div>
            )}
            
            {/* Property Results */}
            {turn.type === 'tool_result' && 
             turn.tool_name === 'search_properties' && 
             turn.tool_result?.data?.results && (
              <div className="mt-2">
                <p className="text-xs text-green-700 font-medium mb-2">
                  Found {turn.tool_result.data.results.length} properties:
                </p>
                {renderPropertyCard(turn.tool_result.data.results)}
              </div>
            )}
            
            {/* Other Tool Results */}
            {turn.type === 'tool_result' && turn.tool_name !== 'search_properties' && (
              <div className="mt-2 bg-green-50 rounded p-2">
                <p className="text-xs text-green-700 font-medium">Result:</p>
                <p className="text-xs text-green-600">
                  {turn.tool_result?.data?.message || 'Action completed'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button 
          onClick={refetch}
          className="mt-2 text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!call) {
    return (
      <div className="text-center py-12">
        <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Call not found</h3>
        <Link to="/calls" className="text-coral hover:text-coral-dark">
          ← Back to calls
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link 
            to="/calls"
            className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-navy">Call Details</h1>
            <p className="text-gray-500">
              {call.caller_number} • {new Date(call.started_at).toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(getCallStatus(call))}`}>
            {getCallStatus(call)}
          </span>
          <div className="text-right text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>{formatDuration(call.started_at, call.ended_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Call Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Call Information</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Caller</dt>
                <dd className="font-medium">{call.caller_number}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Agent Number</dt>
                <dd>{call.agent_number}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Started</dt>
                <dd>{new Date(call.started_at).toLocaleString()}</dd>
              </div>
              {call.ended_at && (
                <div>
                  <dt className="text-gray-500">Ended</dt>
                  <dd>{new Date(call.ended_at).toLocaleString()}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Twilio SID</dt>
                <dd className="font-mono text-xs">{call.twilio_sid}</dd>
              </div>
              {call.outcome && (
                <div>
                  <dt className="text-gray-500">Outcome</dt>
                  <dd className="font-medium">{call.outcome}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Live Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Live Timeline</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Live updates</span>
              </div>
            </div>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {turns.length > 0 ? (
                turns.map(renderTimelineEvent)
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No events yet</p>
                  <p className="text-xs mt-1">Timeline updates will appear here in real-time</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Call Summary */}
      {call.summary && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Call Summary</h3>
          <p className="text-gray-700">{call.summary}</p>
        </div>
      )}
    </div>
  )
}

export default CallDetail