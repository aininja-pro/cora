import express from 'express'
import { calendarService } from '../services/googleCalendarService'

const router = express.Router()

// Initiate OAuth flow
router.get('/auth/:agentId', (req, res) => {
  // Check if OAuth is configured
  const configCheck = calendarService.checkConfiguration()
  if (!configCheck.configured) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: configCheck.message,
      setupRequired: true
    })
  }

  const { agentId } = req.params
  const authUrl = calendarService.getAuthUrl(agentId)
  res.redirect(authUrl)
})

// OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: agentId } = req.query

    console.log('OAuth callback received:', { code: !!code, agentId })

    if (!code || !agentId) {
      return res.status(400).send('Missing code or agentId')
    }

    const tokens = await calendarService.getTokensFromCode(code as string)
    console.log('Got tokens from Google:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token
    })

    await calendarService.saveTokens(agentId as string, tokens)
    console.log('Tokens saved for agent:', agentId)

    // Redirect to dashboard with success message
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard?calendar=connected`)
  } catch (error: any) {
    console.error('OAuth callback error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    })
    res.status(500).send(`Authentication failed: ${error.message}`)
  }
})

// Create event
router.post('/events', async (req, res) => {
  try {
    const { agentId, event } = req.body
    
    // Convert date strings to Date objects
    event.startTime = new Date(event.startTime)
    event.endTime = new Date(event.endTime)
    
    const result = await calendarService.createEvent(agentId, event)
    res.json({ success: true, event: result })
  } catch (error: any) {
    console.error('Create event error:', error)
    
    if (error.message === 'Not authenticated with Google Calendar') {
      return res.status(401).json({ error: 'Not authenticated', requiresAuth: true })
    }
    
    res.status(500).json({ error: error.message })
  }
})

// Get events
router.get('/events/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params
    const { start, end } = req.query
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates required' })
    }
    
    const startDate = new Date(start as string)
    const endDate = new Date(end as string)
    
    const events = await calendarService.getEvents(agentId, startDate, endDate)
    res.json({ success: true, events })
  } catch (error: any) {
    console.error('Get events error:', error)
    
    if (error.message === 'Not authenticated with Google Calendar') {
      return res.status(401).json({ error: 'Not authenticated', requiresAuth: true })
    }
    
    res.status(500).json({ error: error.message })
  }
})

// Update event
router.patch('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params
    const { agentId, updates } = req.body
    
    // Convert date strings if present
    if (updates.startTime) updates.startTime = new Date(updates.startTime)
    if (updates.endTime) updates.endTime = new Date(updates.endTime)
    
    const result = await calendarService.updateEvent(agentId, eventId, updates)
    res.json({ success: true, event: result })
  } catch (error: any) {
    console.error('Update event error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete event
router.delete('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params
    const { agentId } = req.body
    
    await calendarService.deleteEvent(agentId, eventId)
    res.json({ success: true })
  } catch (error: any) {
    console.error('Delete event error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Sync events from Google
router.post('/sync/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params
    await calendarService.syncEvents(agentId)
    res.json({ success: true, message: 'Events synced successfully' })
  } catch (error: any) {
    console.error('Sync events error:', error)
    
    if (error.message === 'Not authenticated with Google Calendar') {
      return res.status(401).json({ error: 'Not authenticated', requiresAuth: true })
    }
    
    res.status(500).json({ error: error.message })
  }
})

// Check authentication status
router.get('/status/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params

    // First check if tokens exist in database
    const { supabase } = require('../config/supabase')
    const { data: authData, error } = await supabase
      .from('google_calendar_auth')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    console.log('Auth check for', agentId, ':', {
      hasData: !!authData,
      hasAccessToken: !!authData?.access_token,
      hasRefreshToken: !!authData?.refresh_token,
      error: error?.message
    })

    const isAuthenticated = await calendarService.authenticate(agentId)
    res.json({
      authenticated: isAuthenticated,
      hasTokensInDb: !!authData,
      tokenExpiry: authData?.token_expires_at
    })
  } catch (error) {
    console.error('Check auth status error:', error)
    res.json({ authenticated: false })
  }
})

export default router