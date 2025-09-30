import { useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { Calendar, Clock, MapPin, Users, Plus, ExternalLink, RefreshCw } from 'lucide-react'
import '../../styles/calendar-mobile.css'
import '../../styles/calendar-override.css'

function CalendarView({ agentId = 'Ray Richards' }) {  // Pass this from parent component based on logged-in user
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check Google Calendar connection status
  useEffect(() => {
    checkConnectionStatus()
    loadEvents()

    // Listen for calendar refresh events from voice assistant
    const handleCalendarRefresh = (event) => {
      console.log('Calendar refresh triggered:', event.detail)
      loadEvents()
    }

    window.addEventListener('calendar-event-created', handleCalendarRefresh)

    return () => {
      window.removeEventListener('calendar-event-created', handleCalendarRefresh)
    }
  }, [])

  const getApiUrl = (path) => {
    const host = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : window.location.hostname.startsWith('192.168') || window.location.hostname.startsWith('10.')
      ? `http://${window.location.hostname}:3000`
      : 'https://cora-server.onrender.com'
    return `${host}${path}`
  }

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch(getApiUrl(`/api/calendar/status/${agentId}`))
      const data = await response.json()
      setIsConnected(data.authenticated)
    } catch (error) {
      console.error('Failed to check calendar status:', error)
    }
  }

  const loadEvents = async () => {
    setLoading(true)
    try {
      // Get events for the next 30 days
      const start = new Date()
      const end = new Date()
      end.setDate(end.getDate() + 30)

      const response = await fetch(
        getApiUrl(`/api/calendar/events/${agentId}?start=${start.toISOString()}&end=${end.toISOString()}`)
      )
      const data = await response.json()

      if (data.success && data.events) {
        // Transform Google Calendar events to FullCalendar format
        const formattedEvents = data.events.map(event => ({
          id: event.id,
          title: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          allDay: !event.start?.dateTime,
          location: event.location,
          description: event.description,
          extendedProps: {
            attendees: event.attendees,
            status: event.status
          }
        }))
        setEvents(formattedEvents)
      }
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEventClick = (clickInfo) => {
    setSelectedEvent(clickInfo.event)
    setShowEventModal(true)
  }

  const handleDateSelect = (selectInfo) => {
    // Open add event modal with selected date/time
    setShowAddModal(true)
    // You can pass selectInfo.start and selectInfo.end to the modal
  }

  const connectGoogleCalendar = async () => {
    // Check if OAuth is configured first
    try {
      const response = await fetch(getApiUrl('/api/calendar/auth/Ray Richards'), {
        method: 'GET',
        redirect: 'manual'
      })

      if (response.status === 503) {
        const data = await response.json()
        alert(`Setup Required: ${data.message}`)
        console.log('Please see GOOGLE_CALENDAR_SETUP.md for configuration instructions')
        return
      }

      // If configured, redirect to OAuth
      window.location.href = getApiUrl(`/api/calendar/auth/${agentId}`)
    } catch (error) {
      console.error('Failed to connect calendar:', error)
      alert('Failed to connect to Google Calendar. Please check the console for details.')
    }
  }

  const syncWithGoogle = async () => {
    try {
      const response = await fetch(getApiUrl('/api/calendar/sync/Ray Richards'), {
        method: 'POST'
      })
      const data = await response.json()
      if (data.success) {
        loadEvents() // Reload events after sync
      }
    } catch (error) {
      console.error('Failed to sync with Google:', error)
    }
  }

  if (!isConnected) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="text-center py-12">
          <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-navy mb-2">Connect Your Calendar</h3>
          <p className="text-gray-600 mb-6">
            Connect your Google Calendar to schedule showings, meetings, and appointments
          </p>
          <button
            onClick={connectGoogleCalendar}
            className="px-6 py-3 bg-coral hover:bg-coral-dark text-white font-medium rounded-lg flex items-center gap-2 mx-auto"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="h-5 w-5" />
            Connect Google Calendar
          </button>
        </div>
      </div>
    )
  }

  // Detect if mobile
  const isMobile = window.innerWidth < 768

  return (
    <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-coral" />
          <h2 className="text-base md:text-lg font-bold text-navy">Calendar</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncWithGoogle}
            className="p-2 md:px-3 md:py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-1"
            title="Sync with Google"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden md:inline">Sync with Google</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 md:px-3 md:py-1 text-sm bg-coral hover:bg-coral-dark text-white rounded-lg flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Add Event</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      ) : (
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={isMobile ? 'listWeek' : 'timeGridWeek'}
          headerToolbar={{
            left: isMobile ? 'prev,next' : 'prev,next today',
            center: isMobile ? 'title' : 'title',
            right: isMobile ? 'dayGridMonth,listWeek' : 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
          }}
          titleFormat={isMobile ? { month: 'short', day: 'numeric' } : undefined}
          dayHeaderFormat={isMobile ? { weekday: 'short' } : undefined}
          events={events}
          eventClick={handleEventClick}
          selectable={true}
          select={handleDateSelect}
          height={isMobile ? '500px' : '600px'}
          nowIndicator={true}
          businessHours={{
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '09:00',
            endTime: '18:00'
          }}
          eventClassNames="cursor-pointer hover:opacity-80"
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short'
          }}
          slotLabelFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short'
          }}
          views={{
            listWeek: {
              buttonText: isMobile ? 'List' : 'list'
            },
            dayGridMonth: {
              buttonText: isMobile ? 'Month' : 'month'
            },
            timeGridWeek: {
              buttonText: 'week'
            },
            timeGridDay: {
              buttonText: 'day'
            }
          }}
          buttonText={{
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            list: 'List'
          }}
        />
      )}

      {/* Event Details Modal */}
      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowEventModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-navy mb-4">{selectedEvent.title}</h3>
            
            {selectedEvent.start && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Clock className="h-4 w-4" />
                <span>
                  {new Date(selectedEvent.start).toLocaleDateString()} at{' '}
                  {new Date(selectedEvent.start).toLocaleTimeString()}
                </span>
              </div>
            )}

            {selectedEvent.extendedProps?.location && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <MapPin className="h-4 w-4" />
                <span>{selectedEvent.extendedProps.location}</span>
              </div>
            )}

            {selectedEvent.extendedProps?.description && (
              <p className="text-sm text-gray-700 mt-4">
                {selectedEvent.extendedProps.description}
              </p>
            )}

            {selectedEvent.extendedProps?.attendees?.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <Users className="h-4 w-4" />
                  <span>Attendees:</span>
                </div>
                <ul className="text-sm text-gray-700 ml-6">
                  {selectedEvent.extendedProps.attendees.map((attendee, idx) => (
                    <li key={idx}>{attendee.displayName || attendee.email}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  window.open(`https://calendar.google.com/calendar/r/eventedit/${selectedEvent.id}`)
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Google
              </button>
              <button
                onClick={() => setShowEventModal(false)}
                className="px-4 py-2 bg-coral hover:bg-coral-dark text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarView