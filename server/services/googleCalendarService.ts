import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { supabase } from '../config/supabase'

const SCOPES = ['https://www.googleapis.com/auth/calendar']

interface CalendarAuth {
  access_token: string
  refresh_token: string
  token_expires_at: string
  google_calendar_id?: string
}

interface CalendarEvent {
  id?: string
  title: string
  description?: string
  location?: string
  startTime: Date
  endTime: Date
  attendees?: Array<{ email: string; name?: string }>
  reminders?: { minutes: number }[]
}

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client
  private isConfigured: boolean

  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    // Check if credentials are properly configured
    this.isConfigured = !!(
      clientId &&
      clientSecret &&
      clientId !== 'your_google_client_id_here' &&
      clientSecret !== 'your_google_client_secret_here'
    )

    this.oauth2Client = new google.auth.OAuth2(
      clientId || 'placeholder',
      clientSecret || 'placeholder',
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback'
    )
  }

  // Check if OAuth is properly configured
  checkConfiguration(): { configured: boolean; message?: string } {
    if (!this.isConfigured) {
      return {
        configured: false,
        message: 'Google Calendar OAuth not configured. Please follow the setup instructions in GOOGLE_CALENDAR_SETUP.md'
      }
    }
    return { configured: true }
  }

  // Generate OAuth URL for user consent
  getAuthUrl(agentId: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: agentId,
      prompt: 'consent'
    })
  }

  // Exchange code for tokens
  async getTokensFromCode(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code)
    return tokens
  }

  // Store tokens in Supabase
  async saveTokens(agentId: string, tokens: any) {
    const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600000)

    const { error } = await supabase
      .from('google_calendar_auth')
      .upsert({
        agent_id: agentId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString()
      })

    if (error) throw error

    // Get primary calendar ID
    this.oauth2Client.setCredentials(tokens)
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })
    const { data } = await calendar.calendarList.list()
    
    const primaryCalendar = data.items?.find(cal => cal.primary) || data.items?.[0]
    if (primaryCalendar) {
      await supabase
        .from('google_calendar_auth')
        .update({ google_calendar_id: primaryCalendar.id })
        .eq('agent_id', agentId)
    }
  }

  // Get stored tokens and set credentials
  async authenticate(agentId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('google_calendar_auth')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    if (error || !data) return false

    const auth = data as CalendarAuth

    // Check if token needs refresh
    const now = new Date()
    const expiresAt = new Date(auth.token_expires_at)
    
    if (expiresAt <= now) {
      // Refresh token
      this.oauth2Client.setCredentials({
        refresh_token: auth.refresh_token
      })

      const { credentials } = await this.oauth2Client.refreshAccessToken()
      
      // Update stored tokens
      await supabase
        .from('google_calendar_auth')
        .update({
          access_token: credentials.access_token,
          token_expires_at: new Date(credentials.expiry_date!).toISOString()
        })
        .eq('agent_id', agentId)

      this.oauth2Client.setCredentials(credentials)
    } else {
      this.oauth2Client.setCredentials({
        access_token: auth.access_token,
        refresh_token: auth.refresh_token
      })
    }

    return true
  }

  // Create calendar event
  async createEvent(agentId: string, event: CalendarEvent) {
    const isAuth = await this.authenticate(agentId)
    if (!isAuth) throw new Error('Not authenticated with Google Calendar')

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })

    // Get calendar ID
    const { data: authData } = await supabase
      .from('google_calendar_auth')
      .select('google_calendar_id')
      .eq('agent_id', agentId)
      .single()

    const calendarId = authData?.google_calendar_id || 'primary'

    // Format attendees for Google Calendar API
    const formatAttendees = (attendees?: Array<{ email?: string; name?: string; displayName?: string }>) => {
      if (!attendees || attendees.length === 0) return undefined

      // Google Calendar requires valid email format
      const validAttendees = attendees
        .filter(a => a && (a.email || a.name || a.displayName))
        .map(a => {
          // If no email but has name, skip this attendee (Google requires email)
          if (!a.email || !a.email.includes('@')) {
            return null
          }
          return {
            email: a.email,
            displayName: a.name || a.displayName
          }
        })
        .filter(a => a !== null)

      // Return undefined if no valid attendees (this prevents the attendees field from being sent)
      return validAttendees.length > 0 ? validAttendees : undefined
    }

    const googleEvent: any = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      },
      reminders: event.reminders ? {
        useDefault: false,
        overrides: event.reminders.map(r => ({
          method: 'popup',
          minutes: r.minutes
        }))
      } : { useDefault: true }
    }

    // Only add attendees if there are valid ones
    const formattedAttendees = formatAttendees(event.attendees)
    if (formattedAttendees && formattedAttendees.length > 0) {
      googleEvent.attendees = formattedAttendees
    }

    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: googleEvent
    })

    // Store in our database
    await supabase
      .from('calendar_events')
      .insert({
        agent_id: agentId,
        google_event_id: data.id,
        title: event.title,
        description: event.description,
        location: event.location,
        start_time: event.startTime.toISOString(),
        end_time: event.endTime.toISOString(),
        sync_status: 'synced',
        created_by: 'voice_assistant'
      })

    return data
  }

  // Update event
  async updateEvent(agentId: string, eventId: string, updates: Partial<CalendarEvent>) {
    const isAuth = await this.authenticate(agentId)
    if (!isAuth) throw new Error('Not authenticated with Google Calendar')

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })

    // Get Google event ID
    const { data: eventData } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('id', eventId)
      .single()

    if (!eventData?.google_event_id) throw new Error('Event not found')

    const { data: authData } = await supabase
      .from('google_calendar_auth')
      .select('google_calendar_id')
      .eq('agent_id', agentId)
      .single()

    const calendarId = authData?.google_calendar_id || 'primary'

    const googleUpdates: any = {}
    if (updates.title) googleUpdates.summary = updates.title
    if (updates.description) googleUpdates.description = updates.description
    if (updates.location) googleUpdates.location = updates.location
    if (updates.startTime) {
      googleUpdates.start = {
        dateTime: updates.startTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      }
    }
    if (updates.endTime) {
      googleUpdates.end = {
        dateTime: updates.endTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      }
    }

    const { data } = await calendar.events.patch({
      calendarId,
      eventId: eventData.google_event_id,
      requestBody: googleUpdates
    })

    // Update local database
    const localUpdates: any = {}
    if (updates.title) localUpdates.title = updates.title
    if (updates.description) localUpdates.description = updates.description
    if (updates.location) localUpdates.location = updates.location
    if (updates.startTime) localUpdates.start_time = updates.startTime.toISOString()
    if (updates.endTime) localUpdates.end_time = updates.endTime.toISOString()
    localUpdates.updated_at = new Date().toISOString()

    await supabase
      .from('calendar_events')
      .update(localUpdates)
      .eq('id', eventId)

    return data
  }

  // Delete event
  async deleteEvent(agentId: string, eventId: string) {
    const isAuth = await this.authenticate(agentId)
    if (!isAuth) throw new Error('Not authenticated with Google Calendar')

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })

    // Get Google event ID
    const { data: eventData } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('id', eventId)
      .single()

    if (!eventData?.google_event_id) throw new Error('Event not found')

    const { data: authData } = await supabase
      .from('google_calendar_auth')
      .select('google_calendar_id')
      .eq('agent_id', agentId)
      .single()

    const calendarId = authData?.google_calendar_id || 'primary'

    await calendar.events.delete({
      calendarId,
      eventId: eventData.google_event_id
    })

    // Delete from local database
    await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
  }

  // Get events for a date range
  async getEvents(agentId: string, startDate: Date, endDate: Date) {
    const isAuth = await this.authenticate(agentId)
    if (!isAuth) throw new Error('Not authenticated with Google Calendar')

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })

    const { data: authData } = await supabase
      .from('google_calendar_auth')
      .select('google_calendar_id')
      .eq('agent_id', agentId)
      .single()

    const calendarId = authData?.google_calendar_id || 'primary'

    const { data } = await calendar.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    })

    return data.items || []
  }

  // Sync events from Google to local database
  async syncEvents(agentId: string) {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    
    const events = await this.getEvents(agentId, now, thirtyDaysFromNow)

    for (const event of events) {
      if (!event.id || !event.summary) continue

      const eventData = {
        agent_id: agentId,
        google_event_id: event.id,
        title: event.summary,
        description: event.description || '',
        location: event.location || '',
        start_time: event.start?.dateTime || event.start?.date,
        end_time: event.end?.dateTime || event.end?.date,
        all_day: !event.start?.dateTime,
        status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
        last_synced_at: new Date().toISOString()
      }

      await supabase
        .from('calendar_events')
        .upsert(eventData, {
          onConflict: 'google_event_id'
        })
    }
  }
}

export const calendarService = new GoogleCalendarService()