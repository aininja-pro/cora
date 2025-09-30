-- Calendar integration tables for CORA

-- Store Google OAuth tokens for each agent
CREATE TABLE IF NOT EXISTS google_calendar_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  google_calendar_id TEXT, -- Primary calendar ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store calendar events (synced with Google Calendar)
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  google_event_id TEXT UNIQUE, -- Google Calendar event ID

  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_type TEXT CHECK (event_type IN ('showing', 'closing', 'meeting', 'call', 'open_house', 'appointment', 'personal', 'other')),

  -- Time details
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/Los_Angeles',

  -- Related data
  property_id TEXT, -- Link to property if applicable
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  -- Reminders and status
  reminder_minutes INTEGER DEFAULT 15,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),

  -- Sync metadata
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error')),
  created_by TEXT DEFAULT 'voice_assistant', -- voice_assistant, manual, google_import

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store recurring event patterns
CREATE TABLE IF NOT EXISTS recurring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  recurrence_rule TEXT NOT NULL, -- RRULE format
  exceptions DATE[], -- Dates to skip
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar preferences per agent
CREATE TABLE IF NOT EXISTS calendar_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,

  -- Default settings
  default_showing_duration INTEGER DEFAULT 60, -- minutes
  default_meeting_duration INTEGER DEFAULT 30,
  drive_time_buffer INTEGER DEFAULT 15, -- minutes between appointments

  -- Working hours
  work_start_time TIME DEFAULT '09:00',
  work_end_time TIME DEFAULT '18:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Mon-Fri (0=Sun, 6=Sat)

  -- Notification preferences
  email_reminders BOOLEAN DEFAULT TRUE,
  sms_reminders BOOLEAN DEFAULT FALSE,
  default_reminder_minutes INTEGER DEFAULT 15,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_calendar_events_agent_time ON calendar_events(agent_id, start_time);
CREATE INDEX idx_calendar_events_google_id ON calendar_events(google_event_id);
CREATE INDEX idx_calendar_events_status ON calendar_events(status);
CREATE INDEX idx_calendar_events_type ON calendar_events(event_type);

-- Enable RLS
ALTER TABLE google_calendar_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_preferences ENABLE ROW LEVEL SECURITY;

-- Policies (adjust as needed)
CREATE POLICY "Enable all operations for authenticated users" ON google_calendar_auth
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for authenticated users" ON calendar_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for authenticated users" ON recurring_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for authenticated users" ON calendar_preferences
  FOR ALL USING (true) WITH CHECK (true);

-- Update timestamp trigger
CREATE TRIGGER update_google_calendar_auth_updated_at BEFORE UPDATE ON google_calendar_auth
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_preferences_updated_at BEFORE UPDATE ON calendar_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();