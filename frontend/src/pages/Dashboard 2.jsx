import { useState, useEffect } from 'react'
import { Phone, Building, Users, TrendingUp, ArrowRight, Mic, Calendar, MessageSquare, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'

// Components
import SignalBar from '../components/dashboard/SignalBar'
import UrgentSection from '../components/dashboard/UrgentSection'
import LiveFeed from '../components/dashboard/LiveFeed'
import MyQueue from '../components/dashboard/MyQueue'
import RealtimeVoiceAssistant from '../components/dashboard/RealtimeVoiceAssistant'
import OnboardingFlow from '../components/dashboard/OnboardingFlow'

// Services
import sampleDataService from '../services/sampleDataService'
import autoResolutionService from '../services/autoResolutionService'
import taskService from '../services/taskService'

// Hooks
import { useLiveFeed } from '../hooks/useLiveFeed'

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

function Dashboard() {
  const [agent, setAgent] = useState(null)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [stats, setStats] = useState({
    totalCalls: 0,
    answeredRate: 0,
    bookedShowings: 0,
    needsFollowUp: 0
  })
  const [timeRange, setTimeRange] = useState('today') // today, 7d, 30d
  const [selectedAgents, setSelectedAgents] = useState(['all'])

  // Initialize urgent and queue items (will load from Supabase)
  const [urgentItems, setUrgentItems] = useState([])
  const [queueItems, setQueueItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [useSampleData, setUseSampleData] = useState(false)
  const [demoMode, setDemoMode] = useState('dashboard') // 'onboarding' or 'dashboard'

  // Load tasks from Supabase on mount
  const loadUserTasks = async () => {
    const { urgentTasks, queueTasks } = await taskService.getTasks('Ray Richards')
    setUrgentItems(urgentTasks)
    setQueueItems(queueTasks)
  }

  // Subscribe to realtime task updates
  useEffect(() => {
    // Load initial tasks
    loadUserTasks()

    // Subscribe to changes
    const unsubscribe = taskService.subscribeToTasks('Ray Richards', (payload) => {
      // Reload tasks when any change occurs
      loadUserTasks()
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Use the real live feed data
  const { feedItems: liveFeedItems, loading: feedLoading } = useLiveFeed('Ray Richards')

  useEffect(() => {
    // Get agent info from localStorage
    const agentData = localStorage.getItem('agent')
    if (agentData) {
      setAgent(JSON.parse(agentData))
    }

    // Set initial demo mode based on URL or default to dashboard
    const urlParams = new URLSearchParams(window.location.search)
    const initialMode = urlParams.get('mode') || 'dashboard'
    setDemoMode(initialMode)
    
    // Set states based on demo mode
    if (initialMode === 'onboarding') {
      setIsFirstRun(true)
      setUseSampleData(false)
      setLoading(false)
      return // Don't load dashboard data
    } else {
      setIsFirstRun(false)
      setUseSampleData(true)
    }
    
    // Load dashboard data
    loadDashboardData()
    
    // Set up realtime subscriptions
    const cleanupSubscriptions = setupRealtimeSubscriptions()
    
    // Set up auto-resolution processing
    const autoResolutionInterval = setupAutoResolution()
    
    return () => {
      // Cleanup subscriptions and intervals
      if (cleanupSubscriptions) cleanupSubscriptions()
      if (autoResolutionInterval) clearInterval(autoResolutionInterval)
    }
  }, []) // Remove dependencies to prevent re-running

  // Separate useEffect for timeRange changes - only update stats
  useEffect(() => {
    if (!loading) {
      loadKPIData()
    }
  }, [timeRange])

  const checkFirstRun = async () => {
    try {
      const { data: calls } = await supabase
        .from('calls')
        .select('id')
        .limit(1)
      
      const hasRealData = calls && calls.length > 0
      const shouldUseSample = sampleDataService.shouldShowSampleData(hasRealData ? calls.length : 0) && 
                             !sampleDataService.isSampleDataHidden()
      
      // Normal logic: show onboarding only if truly no data
      setIsFirstRun(!hasRealData && !shouldUseSample)
      setUseSampleData(shouldUseSample)
    } catch (error) {
      console.error('Error checking first run:', error)
      setIsFirstRun(true)
      setUseSampleData(false)
    }
  }

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadKPIData(),
        loadUrgentItems(),
        loadMyQueue()
      ])
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadKPIData = async () => {
    try {
      // Use sample data if enabled
      if (useSampleData) {
        const sampleStats = sampleDataService.getSampleStats(timeRange)
        setStats(sampleStats)
        return
      }

      // Calculate date ranges based on timeRange
      const now = new Date()
      let startDate
      
      switch (timeRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      }

      // Fetch calls data with date range
      const callsResponse = await fetch(`/api/calls/search?start_date=${startDate.toISOString()}&end_date=${now.toISOString()}`)
      const callsData = await callsResponse.json()
      
      if (callsData.success) {
        const calls = callsData.calls || []
        
        // KPI Formulas per specifications:
        
        // Total calls = count of calls with started_at in range
        const totalCalls = calls.length
        
        // Answered rate = answered / (answered + missed)
        // answered: status IN ('answered','completed')
        // missed: status IN ('no_answer','busy','failed')
        const answered = calls.filter(call => 
          ['answered', 'completed'].includes(call.status)
        ).length
        const missed = calls.filter(call => 
          ['no_answer', 'busy', 'failed'].includes(call.status)
        ).length
        const answeredRate = (answered + missed) > 0 ? Math.round((answered / (answered + missed)) * 100) : 0
        
        // Booked showings = count of appointments with status IN ('scheduled','confirmed') and start in range
        // For now, using property_inquiries as proxy until appointments API is available
        const bookedShowingsResponse = await fetch(`/api/calls/properties/inquiries?days=${timeRange === 'today' ? 1 : timeRange === '7d' ? 7 : 30}`)
        const bookedShowingsData = await bookedShowingsResponse.json()
        const bookedShowings = bookedShowingsData.success ? bookedShowingsData.total_inquiries || 0 : 0
        
        // Needs follow-up = calls where the last turn is assistant AND there's no agent action flag
        const needsFollowUp = calls.filter(call => {
          // Check if last transcript turn is from assistant
          const transcriptEntries = call.transcript_entries || []
          if (transcriptEntries.length === 0) return false
          
          const lastEntry = transcriptEntries[transcriptEntries.length - 1]
          const lastTurnIsAssistant = lastEntry && lastEntry.role === 'assistant'
          
          // Check for agent action flags (no "contacted", "sms_sent", "task_closed")
          const hasAgentAction = call.agent_contacted || call.sms_sent || call.task_closed
          
          return lastTurnIsAssistant && !hasAgentAction
        }).length
        
        setStats({
          totalCalls,
          answeredRate,
          bookedShowings,
          needsFollowUp
        })
      }
    } catch (error) {
      console.error('Error loading KPI data:', error)
      // Fallback to sample data
      const sampleStats = sampleDataService.getSampleStats(timeRange)
      setStats(sampleStats)
    }
  }

  const loadUrgentItems = async () => {
    try {
      // Skip loading if we already have user items (don't overwrite)
      // Use sample data if enabled
      if (useSampleData) {
        const sampleUrgent = sampleDataService.getSampleUrgentItems()
        // Only set sample data if we don't have any items yet
        setUrgentItems(prev => {
          if (prev.length > 0) {
            // Already have items, don't overwrite
            return prev
          }
          return sampleUrgent
        })
        return
      }

      const now = new Date()
      const businessHours = isBusinessHours(now)
      
      // Fetch recent calls and appointments for priority analysis
      const [callsResponse, appointmentsResponse] = await Promise.all([
        fetch(`/api/calls/recent?limit=100`),
        // fetch(`/api/appointments/upcoming`) // When appointments API is available
      ])
      
      const callsData = await callsResponse.json()
      const calls = callsData.success ? callsData.calls || [] : []
      
      const newUrgentItems = []
      
      // Process each call for urgent conditions
      for (const call of calls) {
        const callTime = new Date(call.created_at)
        const minutesSince = (now - callTime) / (1000 * 60)
        
        // URGENT (red) conditions
        
        // 1. Contract/finance deadline due ≤24h or overdue
        if (call.ai_response && call.ai_response.contract_deadline) {
          const deadline = new Date(call.ai_response.contract_deadline)
          const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60)
          
          if (hoursUntilDeadline <= 24) {
            newUrgentItems.push({
              id: `contract_${call.id}`,
              priority: 'urgent',
              title: hoursUntilDeadline < 0 ? 'Contract deadline overdue!' : `Contract deadline due in ${Math.round(hoursUntilDeadline)}h`,
              context: `${call.caller_name || 'Caller'} - ${call.ai_response.property_address || 'Property'} contract`,
              time: hoursUntilDeadline < 0 ? 'OVERDUE' : `${Math.round(hoursUntilDeadline)}h`,
              actions: ['Review Contract', 'Call Client'],
              callId: call.id
            })
          }
        }
        
        // 2. Callback requested and unanswered for ≥30 min during business hours
        if (businessHours && call.ai_response && call.ai_response.callback_requested && !call.agent_contacted) {
          if (minutesSince >= 30) {
            newUrgentItems.push({
              id: `callback_${call.id}`,
              priority: 'urgent',
              title: 'Callback overdue',
              context: `${call.caller_name || call.phone_number} requested callback ${Math.round(minutesSince)}m ago`,
              time: `${Math.round(minutesSince)}m`,
              actions: ['Call Now', 'Send SMS'],
              callId: call.id
            })
          }
        }
        
        // 3. New qualified lead with no agent touch ≥60 min (business hours)
        if (businessHours && call.ai_response && call.ai_response.lead_qualified && !call.agent_contacted) {
          if (minutesSince >= 60) {
            newUrgentItems.push({
              id: `qualified_${call.id}`,
              priority: 'urgent', 
              title: 'Qualified lead needs attention',
              context: `${call.caller_name || call.phone_number} - High quality lead, ${Math.round(minutesSince)}m ago`,
              time: `${Math.round(minutesSince)}m`,
              actions: ['Call Back', 'Send Info'],
              callId: call.id
            })
          }
        }
        
        // 4. Voicemail from new lead and no agent touch ≥30 min
        if (call.status === 'no_answer' && call.voicemail_left && !call.agent_contacted) {
          if (minutesSince >= 30) {
            newUrgentItems.push({
              id: `voicemail_${call.id}`,
              priority: 'urgent',
              title: 'New voicemail needs response', 
              context: `${call.caller_name || call.phone_number} left voicemail ${Math.round(minutesSince)}m ago`,
              time: `${Math.round(minutesSince)}m`,
              actions: ['Listen', 'Call Back'],
              callId: call.id
            })
          }
        }
        
        // SCHEDULING CONFLICT (yellow) conditions
        
        // TODO: Two showings for same agent overlap or gap < 30 min within next 48h
        // TODO: Unconfirmed showing starts in ≤12h
        
        // ROUTINE (blue) conditions - handled in separate section
      }
      
      // Sort: Urgent > Conflict > Routine. Within each: ascending by deadline/start time, then created_at
      newUrgentItems.sort((a, b) => {
        const priorityOrder = { urgent: 0, scheduling_conflict: 1, routine: 2 }
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        }
        
        // Within same priority, sort by time (most urgent first)
        const aTime = parseFloat(a.time) || 0
        const bTime = parseFloat(b.time) || 0
        return bTime - aTime // Higher time = more urgent
      })
      
      // Merge with user-created items from localStorage
      setUrgentItems(prev => {
        const userItems = prev.filter(item => item.isUserCreated)
        return [...userItems, ...newUrgentItems]
      })

    } catch (error) {
      console.error('Error loading urgent items:', error)
      // Fallback to sample data but preserve user items
      const sampleUrgent = sampleDataService.getSampleUrgentItems()
      setUrgentItems(prev => {
        const userItems = prev.filter(item => item.isUserCreated)
        return [...userItems, ...sampleUrgent]
      })
    }
  }
  
  const isBusinessHours = (date) => {
    const hour = date.getHours()
    const day = date.getDay() // 0 = Sunday, 6 = Saturday
    return day >= 1 && day <= 5 && hour >= 8 && hour < 18 // Mon-Fri 8AM-6PM
  }

  
  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  
  const getCallStatus = (call) => {
    if (call.ai_response?.lead_qualified) return 'qualified'
    if (call.ai_response?.callback_requested) return 'needs_followup'
    if (call.ai_response?.appointment_scheduled) return 'confirmed'
    return 'completed'
  }

  const loadMyQueue = async () => {
    try {
      // Skip loading if we already have user items (don't overwrite)
      // Use sample data if enabled
      if (useSampleData) {
        const sampleQueue = sampleDataService.getSampleQueueItems()
        // Only set sample data if we don't have any items yet
        setQueueItems(prev => {
          if (prev.length > 0) {
            // Already have items, don't overwrite
            return prev
          }
          return sampleQueue
        })
        return
      }

      // Fetch recent calls that need agent action
      const callsResponse = await fetch(`/api/calls/recent?limit=50`)
      const callsData = await callsResponse.json()
      const calls = callsData.success ? callsData.calls || [] : []
      
      const newQueueItems = []
      
      for (const call of calls) {
        // Skip if already handled by agent
        if (call.agent_contacted || call.task_closed) continue
        
        const callTime = new Date(call.created_at)
        const minutesSince = (callTime - new Date()) / (1000 * 60)
        
        // Confirm/Reschedule showing
        if (call.ai_response?.appointment_scheduled && !call.ai_response?.appointment_confirmed) {
          newQueueItems.push({
            id: `confirm_${call.id}`,
            type: 'confirm_showing',
            title: `Confirm showing at ${call.ai_response.property_address || 'Property'}`,
            contact: call.caller_name || 'Client',
            phone: call.phone_number,
            time: call.ai_response.appointment_time || 'TBD',
            status: 'open',
            callId: call.id
          })
        }
        
        // Call back requests
        if (call.ai_response?.callback_requested) {
          newQueueItems.push({
            id: `callback_${call.id}`,
            type: 'call_back',
            title: `Call back ${call.caller_name || 'caller'}`,
            contact: call.caller_name || 'Client',
            phone: call.phone_number,
            context: call.ai_response.callback_reason || `Interested in ${call.ai_response.property_address || 'properties'}`,
            status: 'open',
            callId: call.id
          })
        }
        
        // Send listings requests
        if (call.ai_response?.send_listings_requested) {
          const criteria = []
          if (call.ai_response.bedrooms) criteria.push(`${call.ai_response.bedrooms}BR`)
          if (call.ai_response.price_range) criteria.push(`$${call.ai_response.price_range}`)
          if (call.ai_response.location_preference) criteria.push(call.ai_response.location_preference)
          
          newQueueItems.push({
            id: `listings_${call.id}`,
            type: 'send_listings', 
            title: `Send listings to ${call.caller_name || 'client'}`,
            contact: call.caller_name || 'Client',
            phone: call.phone_number,
            context: criteria.length > 0 ? criteria.join(', ') : 'Custom search criteria',
            status: 'open',
            callId: call.id
          })
        }
        
        // Send recap (for completed calls with significant content)
        if (call.status === 'completed' && call.transcript && call.transcript.length > 200 && !call.recap_sent) {
          newQueueItems.push({
            id: `recap_${call.id}`,
            type: 'send_recap',
            title: `Send recap to ${call.caller_name || 'client'}`,
            contact: call.caller_name || 'Client', 
            phone: call.phone_number,
            context: 'Call summary and next steps',
            status: 'open',
            callId: call.id
          })
        }
        
        // Add note for qualified leads without detailed info
        if (call.ai_response?.lead_qualified && !call.ai_response?.detailed_notes) {
          newQueueItems.push({
            id: `note_${call.id}`,
            type: 'add_note',
            title: `Add notes for ${call.caller_name || 'qualified lead'}`,
            contact: call.caller_name || 'Lead',
            phone: call.phone_number,
            context: 'Document lead preferences and requirements',
            status: 'open',
            callId: call.id
          })
        }
      }
      
      // Sort by priority (most urgent first) and creation time
      newQueueItems.sort((a, b) => {
        const priorityOrder = { 
          confirm_showing: 0,
          call_back: 1, 
          send_listings: 2,
          send_recap: 3,
          add_note: 4
        }
        return priorityOrder[a.type] - priorityOrder[b.type]
      })
      
      // Merge with user-created items from localStorage
      setQueueItems(prev => {
        const userItems = prev.filter(item => item.isUserCreated)
        return [...userItems, ...newQueueItems]
      })

    } catch (error) {
      console.error('Error loading My Queue:', error)
      // Fallback to sample data but preserve user items
      const sampleQueue = sampleDataService.getSampleQueueItems()
      setQueueItems(prev => {
        const userItems = prev.filter(item => item.isUserCreated)
        return [...userItems, ...sampleQueue]
      })
    }
  }

  const setupRealtimeSubscriptions = () => {
    // Subscribe to calls table changes for <2s realtime updates
    const callsSubscription = supabase
      .channel('dashboard-calls')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'calls' },
        (payload) => {
          console.log('Realtime call update:', payload)
          // Immediate updates for different event types
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Refresh all data to ensure consistency - optimized for <2s
            Promise.all([
              loadUrgentItems(),
              loadMyQueue(),
              loadKPIData() // Update stats for new calls
            ])

            // Trigger auto-resolution for new/updated calls with AI responses
            if (payload.new && payload.new.ai_response) {
              setTimeout(() => {
                autoResolutionService.processCallForAutoResolution(payload.new)
              }, 2000) // Wait 2 seconds after AI analysis is complete
            }
          }
        }
      )
      .subscribe()

    // Subscribe to call_transcripts for live transcript updates
    const transcriptSubscription = supabase
      .channel('dashboard-transcripts')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'call_transcripts' },
        (payload) => {
          console.log('Realtime transcript update:', payload)
          // Live feed updates are now handled by useLiveFeed hook
        }
      )
      .subscribe()
      
    // Subscribe to notifications/SMS events when available
    const notificationSubscription = supabase
      .channel('dashboard-notifications')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          console.log('Realtime notification update:', payload)
          // Live feed updates are now handled by useLiveFeed hook
        }
      )
      .subscribe()

    return () => {
      callsSubscription.unsubscribe()
      transcriptSubscription.unsubscribe()
      notificationSubscription.unsubscribe()
    }
  }

  const setupAutoResolution = () => {
    // Process auto-resolution every 30 seconds
    const interval = setInterval(async () => {
      try {
        await autoResolutionService.processPendingCalls()
      } catch (error) {
        console.error('Error in auto-resolution processing:', error)
      }
    }, 30000) // 30 seconds

    // Also process immediately on mount
    setTimeout(() => {
      autoResolutionService.processPendingCalls()
    }, 5000) // Wait 5 seconds after dashboard load

    return interval
  }

  const calculateAnsweredRate = (callStats) => {
    const answered = callStats.answered || 0
    const total = callStats.total || 0
    return total > 0 ? Math.round((answered / total) * 100) : 0
  }

  // Show onboarding for first-time users
  if (isFirstRun) {
    return (
      <div>
        <OnboardingFlow onComplete={() => setIsFirstRun(false)} />
        
        {/* Demo Navigation */}
        <div className="fixed bottom-4 left-4 z-40">
          <button
            onClick={() => {
              setDemoMode('dashboard')
              setIsFirstRun(false)
              setUseSampleData(true)
              window.history.pushState({}, '', '/dashboard?mode=dashboard')
            }}
            className="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg hover:bg-gray-800"
          >
            📊 Demo: Skip to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream pb-20"> {/* pb-20 for FAB space */}
      {/* Mobile-First Layout */}
      <div className="px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="text-center md:text-left">
          <h1 className="text-2xl font-bold text-navy mb-1">
            Welcome back, {agent?.name || 'Agent'}!
          </h1>
          <p className="text-gray-600 text-sm">
            Here's what needs your attention right now.
          </p>
        </div>

        {/* Signal Bar - Compact metrics */}
        <SignalBar 
          stats={stats}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          loading={loading}
        />

        {/* New Layout Order: Urgent → My Queue → Live Feed */}
        
        {/* Urgent Section - Most important, shows first */}
        <UrgentSection
          items={urgentItems}
          loading={loading}
          onMoveToQueue={async (item) => {
            // Move to queue in Supabase
            await taskService.moveTask(item.id, 'queue')
            // Reload tasks to reflect change
            loadUserTasks()
          }}
          onDelete={async (itemId) => {
            // Delete from Supabase
            await taskService.deleteTask(itemId)
            // Reload tasks to reflect change
            loadUserTasks()
          }}
          onUpdate={async (itemId, updates) => {
            // Update in Supabase
            await taskService.updateTask(itemId, updates)
            // Reload tasks to reflect change
            loadUserTasks()
          }}
        />

        {/* My Queue Section - Actionable items above the fold */}
        <MyQueue
          items={queueItems}
          loading={loading}
          onMoveToUrgent={async (item) => {
            // Move to urgent in Supabase
            await taskService.moveTask(item.id, 'urgent')
            // Reload tasks to reflect change
            loadUserTasks()
          }}
          onDelete={async (itemId) => {
            // Delete from Supabase
            await taskService.deleteTask(itemId)
            // Reload tasks to reflect change
            loadUserTasks()
          }}
          onUpdate={async (itemId, updates) => {
            // Update in Supabase
            await taskService.updateTask(itemId, updates)
            // Reload tasks to reflect change
            loadUserTasks()
          }}
        />

        {/* Live Feed Section - Context and recent activity */}
        <LiveFeed
          items={liveFeedItems}
          loading={feedLoading}
        />
      </div>

      {/* Realtime Voice Assistant - Using OpenAI Realtime API */}
      <RealtimeVoiceAssistant
        onAddUrgent={async (task) => {
          console.log('Adding urgent task:', task)
          // Save to Supabase
          await taskService.createTask(task, 'urgent', 'Ray Richards')
          // Reload tasks to show the new one
          loadUserTasks()
        }}
        onAddToQueue={async (item) => {
          console.log('Adding to queue:', item)
          // Save to Supabase
          await taskService.createTask(item, 'queue', 'Ray Richards')
          // Reload tasks to show the new one
          loadUserTasks()
        }}
        onUpdateLiveFeed={() => {
          // Trigger live feed refresh if needed
          console.log('Updating live feed')
        }}
      />

      {/* Demo Navigation */}
      <div className="fixed bottom-4 left-4 z-40">
        <button
          onClick={() => {
            setDemoMode('onboarding')
            setIsFirstRun(true)
            setUseSampleData(false)
            window.history.pushState({}, '', '/dashboard?mode=onboarding')
          }}
          className="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg hover:bg-gray-800"
        >
          🎯 Demo: Back to Onboarding
        </button>
      </div>
    </div>
  )
}

export default Dashboard