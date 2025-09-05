import { useState } from 'react'
import { ChevronDown, TrendingUp } from 'lucide-react'

function SignalBar({ stats, timeRange, onTimeRangeChange, loading }) {
  const [showMetricsDrawer, setShowMetricsDrawer] = useState(false)

  const timeRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' }
  ]

  const formatSignalText = () => {
    if (loading) {
      return 'Loading...'
    }
    
    return `${timeRange === 'today' ? 'Today' : timeRange === '7d' ? 'Last 7D' : 'Last 30D'} • Calls ${stats.totalCalls} • Answered ${stats.answeredRate}% • Showings ${stats.bookedShowings} • Follow-ups ${stats.needsFollowUp}`
  }

  // Mock trend data for sparklines (would come from API in production)
  const getTrendData = (type) => {
    switch (type) {
      case 'calls':
        return [3, 5, 2, 8, 6, 4, stats.totalCalls]
      case 'answered':
        return [85, 78, 90, 82, 88, 85, stats.answeredRate]
      case 'showings':
        return [1, 2, 0, 3, 1, 2, stats.bookedShowings]
      case 'followups':
        return [4, 3, 5, 2, 3, 1, stats.needsFollowUp]
      default:
        return []
    }
  }

  const Sparkline = ({ data, color = '#FF6B6B' }) => {
    if (!data || data.length === 0) return null
    
    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 40
      const y = 20 - ((value - min) / range) * 15
      return `${x},${y}`
    }).join(' ')

    return (
      <svg width="40" height="20" className="inline-block ml-2">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Signal Bar - ≤48px height */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setShowMetricsDrawer(!showMetricsDrawer)}
        style={{ minHeight: '48px', maxHeight: '48px' }}
      >
        {/* Signal Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">
            {formatSignalText()}
          </p>
        </div>

        {/* Time Range Chips + Expand Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Desktop: Show time range chips */}
          <div className="hidden md:flex items-center gap-1">
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  onTimeRangeChange(option.value)
                }}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  timeRange === option.value
                    ? 'bg-coral text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Expand/Collapse Icon */}
          <ChevronDown 
            className={`h-4 w-4 text-gray-400 transition-transform ${
              showMetricsDrawer ? 'rotate-180' : ''
            }`} 
          />
        </div>
      </div>

      {/* Metrics Drawer - Collapsible */}
      {showMetricsDrawer && (
        <div className="border-t border-gray-200 p-4 bg-gray-50 animate-slide-down">
          {/* Mobile: Time Range Chips */}
          <div className="md:hidden flex items-center gap-2 mb-4">
            <span className="text-sm text-gray-600">Period:</span>
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => onTimeRangeChange(option.value)}
                className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                  timeRange === option.value
                    ? 'bg-coral text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Detailed Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total calls</p>
                  <p className="text-lg font-bold text-navy">{loading ? '...' : stats.totalCalls}</p>
                </div>
                <Sparkline data={getTrendData('calls')} color="#1971C2" />
              </div>
            </div>

            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Answered rate</p>
                  <p className="text-lg font-bold text-navy">{loading ? '...' : `${stats.answeredRate}%`}</p>
                </div>
                <Sparkline data={getTrendData('answered')} color="#22C55E" />
              </div>
            </div>

            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Booked showings</p>
                  <p className="text-lg font-bold text-navy">{loading ? '...' : stats.bookedShowings}</p>
                </div>
                <Sparkline data={getTrendData('showings')} color="#8B5CF6" />
              </div>
            </div>

            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Needs follow-up</p>
                  <p className="text-lg font-bold text-navy">{loading ? '...' : stats.needsFollowUp}</p>
                </div>
                <Sparkline data={getTrendData('followups')} color="#F59E0B" />
              </div>
            </div>
          </div>

          {/* Last 7 days trend note */}
          <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Trends show last 7 days
          </p>
        </div>
      )}

      {/* Custom CSS for slide-down animation */}
      <style jsx>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 300px;
          }
        }
        .animate-slide-down {
          animation: slide-down 0.2s ease-out;
        }
      `}</style>
    </div>
  )
}

export default SignalBar