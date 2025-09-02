import { useState } from 'react'
import { Phone, TrendingUp, Calendar, AlertCircle, ChevronDown } from 'lucide-react'

function KPISection({ stats, timeRange, onTimeRangeChange, selectedAgents, onAgentsChange, loading }) {
  const [showFilters, setShowFilters] = useState(false)

  const timeRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' }
  ]

  const kpiCards = [
    {
      title: 'Total Calls',
      value: stats.totalCalls,
      icon: Phone,
      color: 'text-coral'
    },
    {
      title: 'Answered Rate',
      value: `${stats.answeredRate}%`,
      icon: TrendingUp,
      color: 'text-coral'
    },
    {
      title: 'Booked Showings',
      value: stats.bookedShowings,
      icon: Calendar,
      color: 'text-coral'
    },
    {
      title: 'Needs Follow-up',
      value: stats.needsFollowUp,
      icon: AlertCircle,
      color: 'text-coral'
    }
  ]

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="h-6 w-6 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-navy">Overview</h2>
        
        {/* Time Range Filter */}
        <div className="flex items-center gap-2">
          {timeRangeOptions.map(option => (
            <button
              key={option.value}
              onClick={() => onTimeRangeChange(option.value)}
              className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                timeRange === option.value
                  ? 'bg-coral text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid - Mobile optimized */}
      <div className="grid grid-cols-2 gap-4">
        {kpiCards.map((kpi, index) => {
          const IconComponent = kpi.icon
          return (
            <div key={index} className="bg-cream rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <IconComponent className={`h-5 w-5 ${kpi.color}`} />
                <span className="text-xl font-bold text-navy">{kpi.value}</span>
              </div>
              <p className="text-sm text-gray-600 font-medium">{kpi.title}</p>
            </div>
          )
        })}
      </div>

      {/* Agent Filter (collapsed by default on mobile) */}
      {selectedAgents.length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-gray-600"
          >
            Filters
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          
          {showFilters && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-2">Agents: All selected</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default KPISection