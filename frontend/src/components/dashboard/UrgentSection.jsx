import { AlertTriangle, Clock, Calendar, CheckCircle, MoreHorizontal } from 'lucide-react'

function UrgentSection({ items, loading }) {
  // Priority badges configuration
  const getPriorityConfig = (priority) => {
    switch (priority) {
      case 'urgent':
        return {
          bg: 'bg-red-50',
          border: 'border-[#E03131]',
          text: 'text-[#E03131]',
          badge: 'bg-[#E03131] text-white',
          label: 'URGENT'
        }
      case 'scheduling_conflict':
        return {
          bg: 'bg-amber-50',
          border: 'border-[#F08C00]',
          text: 'text-[#F08C00]',
          badge: 'bg-[#F08C00] text-white',
          label: 'SCHEDULING CONFLICT'
        }
      case 'routine':
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-[#1971C2]',
          text: 'text-[#1971C2]',
          badge: 'bg-[#1971C2] text-white',
          label: 'ROUTINE'
        }
    }
  }

  const sampleItems = [
    {
      id: '1',
      priority: 'urgent',
      title: 'Contract deadline due in 4 hours',
      context: '123 Main Street - Buyer response needed',
      time: '4h',
      actions: ['Review Contract', 'Call Buyer']
    },
    {
      id: '2',
      priority: 'scheduling_conflict', 
      title: 'Double-booked showing needs resolution',
      context: 'Your showing at 456 Oak Ave overlaps with 789 Pine St.',
      time: '2h',
      actions: ['Move Showing', 'See All Options']
    }
  ]

  const displayItems = items.length > 0 ? items : (loading ? [] : sampleItems)

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="p-4 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (displayItems.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-bold text-navy">All Caught Up!</h2>
        </div>
        <p className="text-gray-600">No urgent items need attention right now.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#E03131]" />
          <h2 className="text-lg font-bold text-navy">Urgent</h2>
          <span className="bg-[#E03131] text-white text-xs px-2 py-1 rounded-full font-medium">
            {displayItems.filter(item => item.priority === 'urgent').length}
          </span>
        </div>

        {/* Batch Actions Bar - when ≥2 routine items */}
        {displayItems.filter(item => item.priority === 'routine').length >= 2 && (
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-[#1971C2] text-white text-xs font-medium rounded hover:opacity-90">
              Approve All Non-Critical
            </button>
            <button className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200">
              Review Later (30m)
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {displayItems.map((item) => {
          const priorityConfig = getPriorityConfig(item.priority)
          
          return (
            <div
              key={item.id}
              className={`p-4 rounded-lg border-l-4 ${priorityConfig.bg} ${priorityConfig.border}`}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs font-bold px-2 py-1 rounded ${priorityConfig.badge}`}>
                  {priorityConfig.label}
                </span>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{item.time}</span>
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <MoreHorizontal className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Title & Context */}
              <h3 className={`font-bold mb-2 ${priorityConfig.text}`}>
                {item.title}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {item.context}
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                {item.actions.map((action, idx) => (
                  <button
                    key={idx}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      idx === 0
                        ? `${priorityConfig.badge} hover:opacity-90`
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Batch Actions for Routine Items */}
      {displayItems.filter(item => item.priority === 'routine').length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
          <button className="px-4 py-2 bg-[#1971C2] text-white text-sm font-medium rounded-lg hover:opacity-90">
            Approve All Non-Critical
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
            Review Later (30m)
          </button>
        </div>
      )}
    </div>
  )
}

export default UrgentSection