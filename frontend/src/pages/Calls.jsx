import { useState, useEffect } from 'react'
import { Phone, Clock, User, MessageSquare, TrendingUp, Calendar } from 'lucide-react'

function Calls() {
  const [calls, setCalls] = useState([])
  const [selectedCall, setSelectedCall] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // For demo, use static data - in production, fetch from API
    setTimeout(() => {
      setCalls([
        {
          id: '1',
          phoneNumber: '+1 (512) 555-0123',
          callerName: 'John Smith',
          duration: 245,
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          property: '123 Main Street',
          leadScore: 'Hot',
          transcript: [
            { speaker: 'Cora', text: 'Hi, this is Cora from Demo Realty. How can I help you today?' },
            { speaker: 'Caller', text: 'Hi, I saw the listing for 123 Main Street online. Can you tell me more about it?' },
            { speaker: 'Cora', text: 'Of course! The house at 123 Main Street is a beautiful 3-bedroom, 2.5 bath home with 2,200 square feet. It\'s listed at $489,000 and features a modern kitchen with granite countertops and hardwood floors throughout.' },
            { speaker: 'Caller', text: 'That sounds great! Does it have a backyard?' },
            { speaker: 'Cora', text: 'Yes, it has a spacious fenced backyard with a custom patio, perfect for entertaining. Would you like to schedule a showing?' },
            { speaker: 'Caller', text: 'Yes, I would. Can we do this Saturday afternoon?' },
            { speaker: 'Cora', text: 'Saturday afternoon works perfectly. I\'ll have our agent contact you to confirm the exact time. May I have your name and best contact number?' },
            { speaker: 'Caller', text: 'It\'s John Smith, and this number is fine.' },
            { speaker: 'Cora', text: 'Perfect, John! We\'ll call you within the hour to confirm your Saturday showing. Is there anything else about the property you\'d like to know?' }
          ]
        },
        {
          id: '2',
          phoneNumber: '+1 (737) 555-0456',
          callerName: 'Sarah Johnson',
          duration: 180,
          timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
          property: '456 Oak Avenue',
          leadScore: 'Warm',
          transcript: [
            { speaker: 'Cora', text: 'Hi, this is Cora from Demo Realty. How can I help you today?' },
            { speaker: 'Caller', text: 'I\'m looking for a 2-bedroom condo in Austin. Do you have anything available?' },
            { speaker: 'Cora', text: 'Yes, we have a beautiful 2-bedroom, 2-bath condo at 456 Oak Avenue. It\'s modern with city views and listed at $325,000.' },
            { speaker: 'Caller', text: 'What are the HOA fees?' },
            { speaker: 'Cora', text: 'The HOA fees are $350 per month and include building maintenance, gym access, and pool amenities. Would you like to see it?' },
            { speaker: 'Caller', text: 'I\'ll think about it and call back. Thank you!' }
          ]
        },
        {
          id: '3',
          phoneNumber: '+1 (Austin) 555-0789',
          callerName: 'Michael Brown',
          duration: 420,
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          property: '789 Pine Lane',
          leadScore: 'Hot',
          transcript: [
            { speaker: 'Cora', text: 'Hi, this is Cora from Demo Realty. How can I help you today?' },
            { speaker: 'Caller', text: 'I\'m interested in luxury homes in Austin. What do you have over $700,000?' },
            { speaker: 'Cora', text: 'We have a stunning 4-bedroom, 3-bath luxury home at 789 Pine Lane listed at $750,000. It features 3,200 square feet, a gourmet kitchen, home office, and media room.' },
            { speaker: 'Caller', text: 'That sounds exactly what I\'m looking for. Can we schedule a tour tomorrow?' },
            { speaker: 'Cora', text: 'Absolutely! I can arrange a private showing tomorrow. What time works best for you?' }
          ]
        }
      ])
      setLoading(false)
    }, 1000)
  }, [])

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
      return `${mins} minutes ago`
    } else if (hours < 24) {
      return `${hours} hours ago`
    } else {
      const days = Math.floor(hours / 24)
      return `${days} day${days > 1 ? 's' : ''} ago`
    }
  }

  const getLeadScoreColor = (score) => {
    switch (score) {
      case 'Hot':
        return 'bg-red-100 text-red-800'
      case 'Warm':
        return 'bg-yellow-100 text-yellow-800'
      case 'Cold':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading call logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Call Intelligence</h1>
        <p className="text-gray-600">AI-powered insights from every conversation</p>
      </div>

      {/* Call Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Phone className="h-6 w-6 text-coral" />
            <span className="text-xl font-bold text-navy">24</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">Calls Today</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <TrendingUp className="h-6 w-6 text-coral" />
            <span className="text-xl font-bold text-navy">8</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">Hot Leads</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Calendar className="h-6 w-6 text-coral" />
            <span className="text-xl font-bold text-navy">5</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">Showings Scheduled</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Clock className="h-6 w-6 text-coral" />
            <span className="text-xl font-bold text-navy">3:45</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">Avg Call Duration</p>
        </div>
      </div>

      {/* Calls List and Transcript */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-navy">Recent Calls</h2>
            </div>
            <div className="divide-y">
              {calls.map((call) => (
                <div
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition ${
                    selectedCall?.id === call.id ? 'bg-cream' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="font-medium text-navy">{call.callerName}</span>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLeadScoreColor(call.leadScore)}`}>
                      {call.leadScore}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{call.phoneNumber}</p>
                  <p className="text-sm text-gray-500 mb-2">Property: {call.property}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{formatTime(call.timestamp)}</span>
                    <span>{formatDuration(call.duration)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-navy">
                {selectedCall ? 'Call Transcript' : 'Select a call to view transcript'}
              </h2>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {selectedCall ? (
                <div className="space-y-4">
                  {selectedCall.transcript.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        message.speaker === 'Cora' ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.speaker === 'Cora'
                            ? 'bg-navy text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="text-xs font-semibold mb-1 opacity-80">
                          {message.speaker}
                        </p>
                        <p className="text-sm">{message.text}</p>
                      </div>
                    </div>
                  ))}
                  
                  {/* AI Insights */}
                  <div className="mt-6 p-4 bg-coral/10 rounded-lg">
                    <h3 className="text-sm font-semibold text-navy mb-2">
                      <MessageSquare className="inline h-4 w-4 mr-2" />
                      AI Insights
                    </h3>
                    <ul className="space-y-1 text-sm text-gray-700">
                      <li>• Caller showed high interest in property features</li>
                      <li>• Requested showing - high intent signal</li>
                      <li>• Price point within their budget range</li>
                      <li>• Follow-up scheduled successfully</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4" />
                  <p>Select a call to view the conversation transcript</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Calls