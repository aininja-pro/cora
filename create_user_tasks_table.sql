-- Create user_tasks table for storing voice-created and manual tasks
CREATE TABLE IF NOT EXISTS user_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'Ray Richards', -- Which agent this belongs to
  section TEXT NOT NULL CHECK (section IN ('urgent', 'queue')), -- Which section it's in

  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  context TEXT,
  contact TEXT,
  phone TEXT,
  time TEXT,
  type TEXT, -- callback, confirm_showing, send_listings, etc.
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),

  -- Actions available for this task
  actions JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'voice_assistant', -- voice_assistant, manual, etc.

  -- For ordering
  sort_order INTEGER DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX idx_user_tasks_agent_section ON user_tasks(agent_id, section);
CREATE INDEX idx_user_tasks_created_at ON user_tasks(created_at DESC);
CREATE INDEX idx_user_tasks_completed ON user_tasks(is_completed);

-- Enable Row Level Security
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations for now (you can restrict later)
CREATE POLICY "Enable all operations for authenticated users" ON user_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_user_tasks_updated_at BEFORE UPDATE ON user_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample insert (you can delete this)
/*
INSERT INTO user_tasks (agent_id, section, title, context, type, priority, actions)
VALUES
  ('Ray Richards', 'urgent', 'Call Bill Brown ASAP', 'Important client needs immediate attention', 'callback', 'urgent', '["Call Now", "Send SMS"]'::jsonb),
  ('Ray Richards', 'queue', 'Confirm showing at 789 Maple Drive', 'Emily Chen, Tomorrow 2:00 PM', 'confirm_showing', 'normal', '["Confirm", "Reschedule"]'::jsonb);
*/