import { Phone, Calendar, MessageSquare, UserCheck, PhoneOff, Clock, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'

function LiveFeed({ items, loading }) {
  const [visibleItems, setVisibleItems] = useState(50)

  const sampleItems = [
    {
      id: '1',
      type: 'call_ended',
      timestamp: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      caller: 'Sarah Johnson',
      phone: '+1 (555) 234-5678',
      transcript: 'Hi, I was wondering if the 3-bedroom house on Oak Avenue is still available? I\'d love to schedule a showing...',
      duration: '4:32',
      status: 'completed'
    },
    {
      id: '2', 
      type: 'appointment_booked',
      timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      property: '456 Pine Street',
      client: 'Mike Davis',
      appointment_time: 'Tomorrow 2:00 PM',
      status: 'confirmed'
    },
    {
      id: '3',
      type: 'sms_sent',
      timestamp: new Date(Date.now() - 23 * 60 * 1000), // 23 minutes ago
      recipient: 'John Smith',
      template: 'showing_confirm',
      status: 'delivered'
    },
    {
      id: '4',
      type: 'lead_qualified',
      timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      caller: 'Emily Chen',
      score: 'High',
      criteria: 'Pre-approved, looking in target area',
      status: 'qualified'
    },
    {
      id: '5',
      type: 'missed_call',
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      caller: 'Unknown',
      phone: '+1 (555) 987-6543',
      voicemail: true,
      status: 'needs_followup'
    }
  ]

  const displayItems = items.length > 0 ? items : (loading ? [] : sampleItems)

  const getEventConfig = (type) => {
    switch (type) {
      case 'call_started':
        return { icon: Phone, color: 'text-green-600', bg: 'bg-green-50', label: 'Call Started' }
      case 'call_ended':
        return { icon: PhoneOff, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Call Ended' }
      case 'appointment_booked':
        return { icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Showing Booked' }
      case 'appointment_rescheduled':
        return { icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Rescheduled' }
      case 'appointment_canceled':
        return { icon: Calendar, color: 'text-red-600', bg: 'bg-red-50', label: 'Canceled' }
      case 'sms_sent':
        return { icon: MessageSquare, color: 'text-coral', bg: 'bg-coral/10', label: 'SMS Sent' }
      case 'sms_failed':
        return { icon: MessageSquare, color: 'text-red-600', bg: 'bg-red-50', label: 'SMS Failed' }
      case 'lead_qualified':
        return { icon: UserCheck, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Qualified' }
      case 'missed_call':
        return { icon: Phone, color: 'text-red-600', bg: 'bg-red-50', label: 'Missed Call' }
      case 'voicemail':
        return { icon: Phone, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Voicemail' }
      default:
        return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Event' }
    }
  }

  const formatTimestamp = (timestamp) => {
    const now = new Date()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const truncateText = (text, length = 140) => {
    if (!text || text.length <= length) return text
    return text.substring(0, length) + '...'
  }

  const formatPhoneNumber = (phone) => {
    if (!phone) return ''
    // Remove all non-digits and format as (XXX) XXX-XXXX for US numbers
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const number = cleaned.slice(1)
      return `(${number.slice(0,3)}) ${number.slice(3,6)}-${number.slice(6)}`
    } else if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`
    }
    return phone // Return original if not standard format
  }

  const getStatusPill = (item) => {
    const configs = {
      qualified: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Qualified' },
      needs_followup: { bg: 'bg-red-100', text: 'text-red-700', label: 'Callback requested' },
      confirmed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Showing booked' },
      delivered: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Delivered' }
    }
    
    const config = configs[item.status]
    if (!config) return null
    
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
              <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-3 w-full bg-gray-200 rounded animate-pulse mb-1"></div>
                <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-coral" />
          <h2 className="text-lg font-bold text-navy">Live Feed</h2>
        </div>
        <div className="text-sm text-gray-500">Today</div>
      </div>

      {displayItems.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">No activity yet today</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {displayItems.slice(0, visibleItems).map((item) => {
              const eventConfig = getEventConfig(item.type)
              const IconComponent = eventConfig.icon

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {/* Event icon */}
                  <div className={`p-2 rounded-full ${eventConfig.bg} flex-shrink-0`}>
                    <IconComponent className={`h-4 w-4 ${eventConfig.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Event type and timestamp */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">{eventConfig.label}</span>
                          <span className="text-xs text-gray-500">{formatTimestamp(item.timestamp)}</span>
                          {getStatusPill(item)}
                        </div>

                        {/* Event details */}
                        <div className="text-sm text-gray-600">
                          {item.type === 'call_ended' && (
                            <>
                              <p className="font-medium text-gray-900 mb-1">
                                {item.caller}
                                {item.phone && ` • ${formatPhoneNumber(item.phone)}`}
                                {item.duration && ` • ${item.duration}`}
                              </p>
                              {item.service && (
                                <p className="text-coral font-medium mb-1">{item.service}</p>
                              )}
                              <p>{truncateText(item.transcript)}</p>
                              {item.leadQuality && (
                                <span className={`inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium ${
                                  item.leadQuality.toLowerCase().includes('high') || item.leadQuality.toLowerCase().includes('hot') ? 'bg-red-100 text-red-700' :
                                  item.leadQuality.toLowerCase().includes('warm') ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {item.leadQuality.toUpperCase()} LEAD
                                </span>
                              )}
                            </>
                          )}
                          
                          {item.type === 'call_started' && (
                            <>
                              <p className="font-medium text-gray-900 mb-1">
                                {item.caller}
                                {item.phone && ` • ${formatPhoneNumber(item.phone)}`}
                              </p>
                              {item.service && (
                                <p className="text-coral font-medium mb-1">{item.service}</p>
                              )}
                              {item.leadQuality && (
                                <span className={`inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium ${
                                  item.leadQuality.toLowerCase().includes('high') || item.leadQuality.toLowerCase().includes('hot') ? 'bg-red-100 text-red-700' :
                                  item.leadQuality.toLowerCase().includes('warm') ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {item.leadQuality.toUpperCase()} LEAD
                                </span>
                              )}
                            </>
                          )}

                          {item.type === 'appointment_booked' && (
                            <>
                              <p className="font-medium text-gray-900">{item.property}</p>
                              <p>
                                {item.client}
                                {item.phone && ` • ${formatPhoneNumber(item.phone)}`}
                                {item.appointment_time && ` • ${item.appointment_time}`}
                              </p>
                            </>
                          )}

                          {item.type === 'sms_sent' && (
                            <>
                              <p className="font-medium text-gray-900">{item.recipient}</p>
                              <p>Template: {item.template}</p>
                            </>
                          )}

                          {item.type === 'lead_qualified' && (
                            <>
                              <p className="font-medium text-gray-900 mb-1">
                                {item.caller}
                                {item.phone && ` • ${formatPhoneNumber(item.phone)}`}
                                {item.score && ` • ${item.score} Quality`}
                              </p>
                              <p>{item.criteria}</p>
                            </>
                          )}

                          {item.type === 'missed_call' && (
                            <>
                              <p className="font-medium text-gray-900 mb-1">
                                {item.caller}
                                {item.phone && ` • ${formatPhoneNumber(item.phone)}`}
                              </p>
                              {item.service && (
                                <p className="text-coral font-medium mb-1">{item.service}</p>
                              )}
                              <p className="text-gray-500">
                                {item.voicemail ? 'Left voicemail' : 'No voicemail'}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Options menu */}
                      <button className="p-1 hover:bg-gray-100 rounded flex-shrink-0">
                        <MoreHorizontal className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Load more button */}
          {displayItems.length > visibleItems && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setVisibleItems(prev => Math.min(prev + 50, 500))}
                className="px-4 py-2 text-sm text-coral hover:text-coral-dark font-medium"
              >
                Load More ({Math.min(displayItems.length - visibleItems, 50)} more)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default LiveFeed