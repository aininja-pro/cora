-- CORA Realtime Voice Assistant - Fresh Start
-- WARNING: This will DELETE all existing call data!

-- Drop existing tables and views
DROP VIEW IF EXISTS call_analytics CASCADE;
DROP TABLE IF EXISTS call_summaries CASCADE;
DROP TABLE IF EXISTS tool_calls CASCADE;
DROP TABLE IF EXISTS call_turns CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;  -- From old system
DROP TABLE IF EXISTS listings CASCADE;  -- Keep if you want properties

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create fresh tables with new schema
CREATE TABLE calls (
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

CREATE TABLE call_turns (
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

CREATE TABLE tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    args JSONB NOT NULL,
    result JSONB NOT NULL,
    duration_ms INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE call_summaries (
    call_id UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
    summary_json JSONB NOT NULL,
    score_lead_quality INTEGER CHECK (score_lead_quality >= 0 AND score_lead_quality <= 100),
    next_actions TEXT[],
    properties_mentioned TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create all indexes
CREATE INDEX idx_calls_tenant_started ON calls(tenant_id, started_at DESC);
CREATE INDEX idx_calls_twilio_sid ON calls(twilio_sid);
CREATE INDEX idx_call_turns_call_id_ts ON call_turns(call_id, ts);
CREATE INDEX idx_call_turns_role ON call_turns(role);
CREATE INDEX idx_tool_calls_call_id ON tool_calls(call_id);
CREATE INDEX idx_tool_calls_name ON tool_calls(name);
CREATE INDEX idx_tool_calls_success ON tool_calls(success);

-- Create analytics view
CREATE VIEW call_analytics AS
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
    COUNT(DISTINCT tc.id) AS tool_calls_count,
    COUNT(DISTINCT tc.id) FILTER (WHERE tc.success) AS successful_tools,
    COUNT(DISTINCT ct.id) FILTER (WHERE ct.role = 'user') AS user_messages,
    COUNT(DISTINCT ct.id) FILTER (WHERE ct.role = 'assistant') AS assistant_messages
FROM calls c
LEFT JOIN call_summaries cs ON c.id = cs.call_id
LEFT JOIN tool_calls tc ON c.id = tc.call_id
LEFT JOIN call_turns ct ON c.id = ct.call_id
GROUP BY c.id, c.tenant_id, c.started_at, c.ended_at, c.outcome, c.caller_number,
         cs.score_lead_quality, cs.next_actions, cs.properties_mentioned
ORDER BY c.started_at DESC;

-- Success
DO $$
BEGIN
    RAISE NOTICE 'Fresh CORA database created successfully!';
    RAISE NOTICE 'All old call data has been removed';
    RAISE NOTICE 'Ready for new Realtime implementation';
END $$;