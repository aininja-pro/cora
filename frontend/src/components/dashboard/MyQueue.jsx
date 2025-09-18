import { CheckCircle, Phone, Send, Calendar, FileText, User, Undo } from 'lucide-react'
import { useState } from 'react'

function MyQueue({ items = [], loading }) {
  const [completedItems, setCompletedItems] = useState([])
  const [showUndo, setShowUndo] = useState(null)

  const sampleItems = [
    {
      id: '1',
      type: 'confirm_showing',
      title: 'Confirm showing at 123 Main Street',
      contact: 'John Smith',
      phone: '+1 (555) 123-4567',
      time: '2:00 PM today',
      status: 'open'
    },
    {
      id: '2', 
      type: 'call_back',
      title: 'Call back Sarah Johnson',
      contact: 'Sarah Johnson',
      phone: '+1 (555) 234-5678',
      context: 'Interested in 456 Oak Avenue',
      status: 'open'
    },
    {
      id: '3',
      type: 'send_listings',
      title: 'Send listings to Mike Davis',
      contact: 'Mike Davis',
      phone: '+1 (555) 345-6789',
      context: '3BR, $400K-500K range, downtown',
      status: 'open'
    }
  ]

  const displayItems = items && items.length > 0 ? items : (loading ? [] : sampleItems.filter(item => 
    !completedItems.includes(item.id)
  ))

  const getActionConfig = (type) => {
    switch (type) {
      case 'confirm_showing':
        return {
          icon: Calendar,
          primaryAction: 'Confirm',
          secondaryAction: 'Reschedule',
          color: 'text-green-600'
        }
      case 'call_back':
        return {
          icon: Phone,
          primaryAction: 'Call Now',
          secondaryAction: 'Add Note',
          color: 'text-coral'
        }
      case 'send_listings':
        return {
          icon: Send,
          primaryAction: 'Send Listings',
          secondaryAction: 'View Properties',
          color: 'text-blue-600'
        }
      case 'send_recap':
        return {
          icon: FileText,
          primaryAction: 'Send Recap',
          secondaryAction: 'Edit First',
          color: 'text-purple-600'
        }
      case 'add_note':
        return {
          icon: User,
          primaryAction: 'Add Note',
          secondaryAction: 'Mark Contacted',
          color: 'text-gray-600'
        }
      default:
        return {
          icon: CheckCircle,
          primaryAction: 'Complete',
          secondaryAction: 'Skip',
          color: 'text-gray-600'
        }
    }
  }

  const handleComplete = (itemId) => {
    setCompletedItems(prev => [...prev, itemId])
    setShowUndo(itemId)
    
    // Auto-hide undo after 10 seconds
    setTimeout(() => {
      setShowUndo(null)
    }, 10000)
  }

  const handleUndo = (itemId) => {
    setCompletedItems(prev => prev.filter(id => id !== itemId))
    setShowUndo(null)
  }

  const handleClearQueue = () => {
    const itemIds = displayItems.map(item => item.id)
    setCompletedItems(prev => [...prev, ...itemIds])
    setShowUndo('all')
    
    // Auto-hide undo after 10 seconds
    setTimeout(() => {
      setShowUndo(null)
    }, 10000)
  }

  const handleUndoAll = () => {
    setCompletedItems([])
    setShowUndo(null)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 border rounded-lg">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse"></div>
                </div>
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
          <CheckCircle className="h-5 w-5 text-coral" />
          <h2 className="text-lg font-bold text-navy">My Queue</h2>
          <span className="bg-coral text-white text-xs px-2 py-1 rounded-full font-medium">
            {displayItems.length}
          </span>
        </div>

        {/* Clear My Queue Button */}
        {displayItems.length > 0 && (
          <button 
            onClick={handleClearQueue}
            className="px-3 py-1 text-sm text-coral hover:text-coral-dark font-medium"
          >
            Clear All ({displayItems.length})
          </button>
        )}
      </div>

      {/* Undo notification */}
      {showUndo && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-green-800">
            {showUndo === 'all' ? 'Queue cleared!' : 'Task completed!'}
          </span>
          <button
            onClick={() => showUndo === 'all' ? handleUndoAll() : handleUndo(showUndo)}
            className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800"
          >
            <Undo className="h-4 w-4" />
            Undo
          </button>
        </div>
      )}

      {displayItems.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Queue cleared!</p>
          <p className="text-sm text-gray-500">All tasks completed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayItems.map((item) => {
            const actionConfig = getActionConfig(item.type)
            const IconComponent = actionConfig.icon

            return (
              <div key={item.id} className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                <div className="flex items-start gap-3">
                  <IconComponent className={`h-6 w-6 ${actionConfig.color} flex-shrink-0 mt-0.5`} />
                  
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <h3 className="font-medium text-navy mb-1">{item.title}</h3>
                    
                    {/* Contact info */}
                    <div className="text-sm text-gray-600 mb-2">
                      <p className="font-medium">{item.contact}</p>
                      {item.phone && (
                        <p className="text-gray-500">{item.phone}</p>
                      )}
                      {item.context && (
                        <p className="text-gray-500 mt-1">{item.context}</p>
                      )}
                      {item.time && (
                        <p className="text-coral font-medium mt-1">{item.time}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleComplete(item.id)}
                        className="px-4 py-2 bg-coral text-white text-sm font-medium rounded-lg hover:bg-coral-dark transition-colors"
                      >
                        {actionConfig.primaryAction}
                      </button>
                      <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                        {actionConfig.secondaryAction}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MyQueue