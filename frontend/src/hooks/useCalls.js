import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ifxuzsckpcrzgbknwyfr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeHV6c2NrcGNyemdia253eWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNjk4NTEsImV4cCI6MjA2OTY0NTg1MX0.TdEGrlG0lAaWQmwPixMuHjDJU-YTR6TeO2WPk-u_yZs'
const supabase = createClient(supabaseUrl, supabaseKey)

import { API_URL } from '../config.js'
const BACKEND_BASE_URL = API_URL

/**
 * Hook for managing calls list with live updates
 */
export function useCalls(tenantId = 'Ray Richards') {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`${BACKEND_BASE_URL}/api/calls?tenant_id=${encodeURIComponent(tenantId)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch calls: ${response.status}`)
      }
      
      const data = await response.json()
      setCalls(data.calls || [])
      
    } catch (err) {
      console.error('Error fetching calls:', err)
      setError(err.message)
      
      // Set mock data for development if API fails
      setCalls([
        {
          id: '00eb929f-7258-4982-a6d2-829c553da9ce',
          tenant_id: 'Ray Richards',
          caller_number: 'unknown',
          agent_number: '+13168670416',
          started_at: '2025-08-24T20:55:23.118739+00:00',
          ended_at: null,
          outcome: null,
          summary: null
        }
      ])
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchCalls()

    // Subscribe to Supabase Realtime for live call updates
    const channel = supabase
      .channel(`calls_${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls',
        filter: `tenant_id=eq.${tenantId}`
      }, (payload) => {
        console.log('📡 Realtime call update:', payload)
        
        // Debounce updates to max 10fps
        setTimeout(() => {
          if (payload.eventType === 'INSERT') {
            setCalls(prev => [payload.new, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setCalls(prev => prev.map(call => 
              call.id === payload.new.id ? payload.new : call
            ))
          } else if (payload.eventType === 'DELETE') {
            setCalls(prev => prev.filter(call => call.id !== payload.old.id))
          }
        }, 100)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchCalls, tenantId])

  return {
    calls,
    loading,
    error,
    refetch: fetchCalls
  }
}

/**
 * Hook for call detail with live timeline updates
 */
export function useCallDetail(callId) {
  const [call, setCall] = useState(null)
  const [turns, setTurns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCallDetail = useCallback(async () => {
    if (!callId) return

    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`${BACKEND_BASE_URL}/api/calls/${callId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch call detail: ${response.status}`)
      }
      
      const data = await response.json()
      setCall(data.call)
      setTurns(data.turns || [])
      
    } catch (err) {
      console.error('Error fetching call detail:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [callId])

  useEffect(() => {
    fetchCallDetail()

    if (!callId) return

    // Subscribe to live timeline updates
    const channel = supabase
      .channel(`call_turns_${callId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'call_turns',
        filter: `call_id=eq.${callId}`
      }, (payload) => {
        console.log('📡 Realtime turn update:', payload)
        
        // Debounce UI updates to ≤10fps (batch inserts from Realtime)
        setTimeout(() => {
          setTurns(prev => {
            // Avoid duplicates
            const exists = prev.some(turn => turn.id === payload.new.id)
            if (exists) return prev
            
            const newTurns = [...prev, payload.new]
            // CRITICAL: Sort by (ts, created_at) for stable ordering
            return newTurns.sort((a, b) => {
              const tsA = new Date(a.ts).getTime()
              const tsB = new Date(b.ts).getTime()
              if (tsA !== tsB) return tsA - tsB
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            })
          })
        }, 100) // 10fps debouncing
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchCallDetail, callId])

  return {
    call,
    turns,
    loading,
    error,
    refetch: fetchCallDetail
  }
}