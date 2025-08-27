-- CORA Realtime Voice Assistant - Supabase Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Calls table - Main call records
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  twilio_sid TEXT UNIQUE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  outcome TEXT,
  caller_number TEXT NOT NULL,
  agent_number TEXT NOT NULL,
  cost_audio_tokens INTEGER DEFAULT 0,
  cost_text_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call turns table - Complete transcript with all interactions
CREATE TABLE IF NOT EXISTS call_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  text TEXT NOT NULL,
  audio_ms INTEGER,
  event_type TEXT NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool calls table - Log all function executions
CREATE TABLE IF NOT EXISTS tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  args JSONB NOT NULL,
  result JSONB NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call summaries table - AI-generated end-of-call summaries
CREATE TABLE IF NOT EXISTS call_summaries (
  call_id UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL,
  score_lead_quality INTEGER CHECK (score_lead_quality >= 0 AND score_lead_quality <= 100),
  next_actions TEXT[],
  properties_mentioned TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_calls_tenant_started ON calls(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_sid);
CREATE INDEX IF NOT EXISTS idx_call_turns_call_id_ts ON call_turns(call_id, ts);
CREATE INDEX IF NOT EXISTS idx_call_turns_role ON call_turns(role);
CREATE INDEX IF NOT EXISTS idx_tool_calls_call_id ON tool_calls(call_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_success ON tool_calls(success);

-- Optional: Row Level Security policies (uncomment if needed)
-- ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE call_turns ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tool_calls ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE call_summaries ENABLE ROW LEVEL SECURITY;

-- Sample data for testing (optional - remove in production)
-- INSERT INTO calls (tenant_id, twilio_sid, caller_number, agent_number) VALUES 
--   ('Ray Richards', 'CA123456789', '+15551234567', '+15559876543');

-- View for call analytics (optional but useful)
CREATE OR REPLACE VIEW call_analytics AS
SELECT 
  c.id,
  c.tenant_id,
  c.started_at,
  c.ended_at,
  c.outcome,
  c.caller_number,
  EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) / 60 AS duration_minutes,
  cs.score_lead_quality,
  cs.next_actions,
  cs.properties_mentioned,
  COUNT(tc.id) AS tool_calls_count,
  COUNT(CASE WHEN tc.success THEN 1 END) AS successful_tools,
  COUNT(ct.id) FILTER (WHERE ct.role = 'user') AS user_messages,
  COUNT(ct.id) FILTER (WHERE ct.role = 'assistant') AS assistant_messages
FROM calls c
LEFT JOIN call_summaries cs ON c.id = cs.call_id
LEFT JOIN tool_calls tc ON c.id = tc.call_id
LEFT JOIN call_turns ct ON c.id = ct.call_id
GROUP BY c.id, cs.score_lead_quality, cs.next_actions, cs.properties_mentioned
ORDER BY c.started_at DESC;

-- Function to get call statistics by tenant (optional)
CREATE OR REPLACE FUNCTION get_tenant_stats(tenant_name TEXT)
RETURNS TABLE (
  total_calls BIGINT,
  successful_outcomes BIGINT,
  avg_lead_quality NUMERIC,
  top_outcomes TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE outcome IN ('book_showing', 'qualify_lead')) as successful_outcomes,
    AVG(cs.score_lead_quality) as avg_lead_quality,
    ARRAY_AGG(DISTINCT c.outcome) FILTER (WHERE c.outcome IS NOT NULL) as top_outcomes
  FROM calls c
  LEFT JOIN call_summaries cs ON c.id = cs.call_id
  WHERE c.tenant_id = tenant_name
    AND c.started_at >= NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL ON calls TO authenticated;
-- GRANT ALL ON call_turns TO authenticated;
-- GRANT ALL ON tool_calls TO authenticated;
-- GRANT ALL ON call_summaries TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'CORA database schema installed successfully!';
  RAISE NOTICE 'Tables created: calls, call_turns, tool_calls, call_summaries';
  RAISE NOTICE 'Indexes and views created for optimal performance';
  RAISE NOTICE 'Ready for CORA Realtime Voice Assistant!';
END
$$;