import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { API_URL } from '../config.js'

const supabaseUrl = 'https://ifxuzsckpcrzgbknwyfr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeHV6c2NrcGNyemdia253eWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNjk4NTEsImV4cCI6MjA2OTY0NTg1MX0.TdEGrlG0lAaWQmwPixMuHjDJU-YTR6TeO2WPk-u_yZs'
const supabase = createClient(supabaseUrl, supabaseKey)
const BACKEND_BASE_URL = API_URL

/**
 * Hook for managing Live Feed with real call data
 */
export function useLiveFeed(tenantId = 'Ray Richards') {
  const [feedItems, setFeedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Helper to parse AI analysis from call data
  const parseCallAnalysis = (call) => {
    let analysis = {}

    // Parse ai_response JSON if available
    if (call.ai_response) {
      try {
        analysis = typeof call.ai_response === 'string'
          ? JSON.parse(call.ai_response)
          : call.ai_response
      } catch (e) {
        console.log('Could not parse ai_response:', call.id, e)
      }
    }

    // Enhanced service extraction logic
    let serviceRequested = analysis.service_requested || ''

    // Check for booking/showing related content in various fields
    if (!serviceRequested || serviceRequested === 'general_question') {
      // Look for showing/appointment keywords in summary or analysis
      const summaryText = (call.summary || analysis.call_summary || analysis.sms_summary || '').toLowerCase()
      const appointmentScheduled = analysis.appointment_scheduled || false

      if (appointmentScheduled || summaryText.includes('showing') || summaryText.includes('appointment')) {
        serviceRequested = 'Property showing scheduled'
      } else if (summaryText.includes('callback') || summaryText.includes('call back')) {
        serviceRequested = summaryText.includes('title') ? 'Callback about title issue' : 'Callback requested'
      } else if (summaryText.includes('listing') || summaryText.includes('property')) {
        serviceRequested = 'Property inquiry'
      } else if (analysis.call_type) {
        serviceRequested = analysis.call_type.replace('_', ' ')
      }
    }

    const result = {
      callerName: call.caller_name || analysis.caller_name || 'Unknown',
      callType: call.call_type || analysis.call_type || '',
      serviceRequested: serviceRequested,
      leadQuality: analysis.lead_quality || '',
      callSummary: call.summary || analysis.call_summary || analysis.sms_summary || '',
      phone: call.caller_number || call.phone_number || '',
      appointmentScheduled: analysis.appointment_scheduled || false,
      ...analysis
    }

    console.log('🔍 LiveFeed: Parsed analysis for call', call.id, result)
    return result
  }

  // Transform database records into Live Feed format
  const transformToFeedItem = useCallback((data, type) => {
    const baseItem = {
      id: data.id,
      timestamp: new Date(data.created_at || data.started_at || data.ts),
      type
    }

    // For call-related items, parse the analysis
    const analysis = type.includes('call') ? parseCallAnalysis(data) : {}

    console.log('🔍 LiveFeed: Transforming item:', type, data.id, { data, analysis })

    switch (type) {
      case 'call_started':
        return {
          ...baseItem,
          caller: analysis.callerName || data.caller_number || 'Unknown',
          phone: analysis.phone || data.caller_number,
          service: analysis.serviceRequested || 'Incoming call',
          leadQuality: analysis.leadQuality,
          status: 'active'
        }

      case 'call_ended':
        const duration = data.ended_at ? calculateDuration(data.started_at, data.ended_at) : 'Unknown'

        return {
          ...baseItem,
          caller: analysis.callerName || data.caller_number || 'Unknown',
          phone: analysis.phone || data.caller_number,
          duration: duration,
          transcript: analysis.callSummary || data.latest_transcript || 'Call completed',
          service: analysis.serviceRequested || analysis.callType || 'General inquiry',
          leadQuality: analysis.leadQuality,
          status: data.outcome === 'completed' ? 'completed' : 'needs_followup'
        }

      case 'appointment_booked':
        return {
          ...baseItem,
          property: data.property_address || data.args?.propertyId || 'Property inquiry',
          client: data.args?.contact?.name || analysis.callerName || data.caller_name || 'Client',
          phone: data.args?.contact?.phone || analysis.phone || data.caller_number || '',
          appointment_time: data.args?.datetimeISO ?
            new Date(data.args.datetimeISO).toLocaleDateString() + ' ' +
            new Date(data.args.datetimeISO).toLocaleTimeString() : 'Scheduled',
          status: 'confirmed'
        }

      case 'lead_qualified':
        return {
          ...baseItem,
          caller: analysis.callerName || data.caller_name || data.args?.contact?.name || 'Lead',
          phone: analysis.phone || data.caller_number || data.args?.contact?.phone || '',
          score: analysis.leadQuality ||
                 (data.args?.financingStatus === 'preapproved' ? 'High' :
                  data.args?.financingStatus === 'prequalified' ? 'Warm' : 'Cold'),
          criteria: analysis.serviceRequested ||
                   `${data.args?.intent || 'Interested'}, ${data.args?.budget ? '$' + data.args.budget.toLocaleString() : 'Budget TBD'}`,
          status: 'qualified'
        }

      case 'missed_call':
        return {
          ...baseItem,
          caller: analysis.callerName || data.caller_number || 'Unknown',
          phone: analysis.phone || data.caller_number,
          service: analysis.serviceRequested || 'Missed call',
          voicemail: false, // Would need to check if voicemail was left
          status: 'needs_followup'
        }

      case 'sms_sent':
        return {
          ...baseItem,
          recipient: data.recipient_name || data.phone || 'Client',
          template: data.template_type || 'notification',
          status: 'delivered'
        }

      default:
        return baseItem
    }
  }, [])

  const calculateDuration = (start, end) => {
    if (!start || !end) return '0:00'
    const diffMs = new Date(end) - new Date(start)
    const diffSecs = Math.floor(diffMs / 1000)
    const mins = Math.floor(diffSecs / 60)
    const secs = diffSecs % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Fetch recent feed items
  const fetchFeedItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const items = []

      console.log('🔍 LiveFeed: Fetching calls for tenant:', tenantId)

      // Use the same backend API approach as the Calls page
      const response = await fetch(`${BACKEND_BASE_URL}/api/calls?tenant_id=${encodeURIComponent(tenantId)}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch calls: ${response.status}`)
      }

      const data = await response.json()
      const calls = data.calls || []

      console.log('🔍 LiveFeed: Backend API calls:', calls.length, calls)

      // Filter to recent calls (last 24 hours) and add call events
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentCalls = calls.filter(call =>
        new Date(call.started_at) >= cutoff
      )

      console.log('🔍 LiveFeed: Recent calls (24h):', recentCalls.length)

      recentCalls.forEach(call => {
        console.log('🔍 LiveFeed: Processing call:', {
          id: call.id,
          ended_at: call.ended_at,
          outcome: call.outcome,
          status: call.status,
          caller_number: call.caller_number
        })

        // Improved logic: check multiple indicators that a call is completed
        // Most calls from the API should be completed since they have analysis data
        const isCallActive = !call.ended_at && !call.outcome &&
                            (!call.status || call.status === 'active' || call.status === 'in_progress')

        if (isCallActive) {
          items.push(transformToFeedItem(call, 'call_started'))
        } else {
          // Default to call_ended for calls with analysis data
          items.push(transformToFeedItem(call, 'call_ended'))
        }
      })

      // For now, let's focus on calls since that's what we know works
      // We can add tool calls and showings later once this is working

      // Sort all items by timestamp and take latest 50
      const sortedItems = items
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50)

      console.log('🔍 LiveFeed: Final feed items:', sortedItems.length, sortedItems)
      setFeedItems(sortedItems)

    } catch (err) {
      console.error('Error fetching feed items:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tenantId, transformToFeedItem])

  useEffect(() => {
    fetchFeedItems()

    // Subscribe to real-time updates for calls
    const callsChannel = supabase
      .channel(`live_feed_calls_${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls',
        filter: `tenant_id=eq.${tenantId}`
      }, (payload) => {
        console.log('🔴 Live Feed: Call update', payload)

        const newItem = payload.eventType === 'UPDATE' && payload.new.ended_at ?
          transformToFeedItem(payload.new, 'call_ended') :
          payload.eventType === 'INSERT' ?
          transformToFeedItem(payload.new, 'call_started') : null

        if (newItem) {
          setFeedItems(prev => {
            // Remove any existing item with same ID, then add new one at top
            const filtered = prev.filter(item => item.id !== newItem.id)
            return [newItem, ...filtered].slice(0, 50)
          })
        }
      })

    // Subscribe to tool calls
    const toolCallsChannel = supabase
      .channel(`live_feed_tools_${tenantId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tool_calls'
      }, async (payload) => {
        console.log('🔧 Live Feed: Tool call', payload)

        // Get call info for this tool call
        const { data: call } = await supabase
          .from('calls')
          .select('tenant_id, caller_number')
          .eq('id', payload.new.call_id)
          .single()

        if (call?.tenant_id === tenantId) {
          const toolData = {
            ...payload.new,
            caller_number: call.caller_number
          }

          let newItem = null
          switch (payload.new.name) {
            case 'book_showing':
              newItem = transformToFeedItem(toolData, 'appointment_booked')
              break
            case 'qualify_lead':
              newItem = transformToFeedItem(toolData, 'lead_qualified')
              break
            case 'request_callback':
              newItem = transformToFeedItem(toolData, 'missed_call')
              break
          }

          if (newItem) {
            setFeedItems(prev => [newItem, ...prev].slice(0, 50))
          }
        }
      })

    // Subscribe to showings
    const showingsChannel = supabase
      .channel(`live_feed_showings_${tenantId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'showings'
      }, (payload) => {
        console.log('📅 Live Feed: Showing booked', payload)

        const newItem = transformToFeedItem({
          ...payload.new,
          property_address: payload.new.property_address || `Property ${payload.new.property_id}`,
          caller_name: payload.new.client_name
        }, 'appointment_booked')

        setFeedItems(prev => [newItem, ...prev].slice(0, 50))
      })

    return () => {
      supabase.removeChannel(callsChannel)
      supabase.removeChannel(toolCallsChannel)
      supabase.removeChannel(showingsChannel)
    }
  }, [fetchFeedItems, tenantId, transformToFeedItem])

  return {
    feedItems,
    loading,
    error,
    refetch: fetchFeedItems
  }
}