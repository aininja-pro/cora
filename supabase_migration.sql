-- CORA Realtime Voice Assistant - Database Migration
-- This script handles both new installations and updates to existing tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing views that might depend on the tables
DROP VIEW IF EXISTS call_analytics CASCADE;

-- Option 1: SAFE MIGRATION (adds missing columns to existing tables)
-- Uncomment this section if you want to preserve existing data

-- Add missing columns to existing calls table if they don't exist
DO $$ 
BEGIN
    -- Check if calls table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'calls') THEN
        -- Add tenant_id if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'tenant_id') THEN
            ALTER TABLE calls ADD COLUMN tenant_id TEXT DEFAULT 'default';
            UPDATE calls SET tenant_id = 'default' WHERE tenant_id IS NULL;
            ALTER TABLE calls ALTER COLUMN tenant_id SET NOT NULL;
        END IF;
        
        -- Add twilio_sid if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'twilio_sid') THEN
            ALTER TABLE calls ADD COLUMN twilio_sid TEXT;
            -- Generate unique values for existing rows
            UPDATE calls SET twilio_sid = 'CA' || id::text WHERE twilio_sid IS NULL;
            ALTER TABLE calls ALTER COLUMN twilio_sid SET NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_twilio_sid_unique ON calls(twilio_sid);
        END IF;
        
        -- Add agent_number if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'agent_number') THEN
            ALTER TABLE calls ADD COLUMN agent_number TEXT DEFAULT '+1234567890';
            UPDATE calls SET agent_number = '+1234567890' WHERE agent_number IS NULL;
            ALTER TABLE calls ALTER COLUMN agent_number SET NOT NULL;
        END IF;
        
        -- Add caller_number if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'caller_number') THEN
            ALTER TABLE calls ADD COLUMN caller_number TEXT DEFAULT 'unknown';
            UPDATE calls SET caller_number = 'unknown' WHERE caller_number IS NULL;
            ALTER TABLE calls ALTER COLUMN caller_number SET NOT NULL;
        END IF;
        
        -- Add cost columns if they don't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'cost_audio_tokens') THEN
            ALTER TABLE calls ADD COLUMN cost_audio_tokens INTEGER DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'cost_text_tokens') THEN
            ALTER TABLE calls ADD COLUMN cost_text_tokens INTEGER DEFAULT 0;
        END IF;
        
        -- Add outcome if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'outcome') THEN
            ALTER TABLE calls ADD COLUMN outcome TEXT;
        END IF;
        
        -- Add timestamps if they don't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'started_at') THEN
            ALTER TABLE calls ADD COLUMN started_at TIMESTAMPTZ DEFAULT NOW();
            UPDATE calls SET started_at = created_at WHERE started_at IS NULL;
            ALTER TABLE calls ALTER COLUMN started_at SET NOT NULL;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'calls' AND column_name = 'ended_at') THEN
            ALTER TABLE calls ADD COLUMN ended_at TIMESTAMPTZ;
        END IF;
    ELSE
        -- Create new calls table if it doesn't exist
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
    END IF;
END $$;

-- Create or update call_turns table
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

-- Create or update tool_calls table
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

-- Create or update call_summaries table
CREATE TABLE IF NOT EXISTS call_summaries (
    call_id UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
    summary_json JSONB NOT NULL,
    score_lead_quality INTEGER CHECK (score_lead_quality >= 0 AND score_lead_quality <= 100),
    next_actions TEXT[],
    properties_mentioned TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes (IF NOT EXISTS prevents errors on duplicates)
CREATE INDEX IF NOT EXISTS idx_calls_tenant_started ON calls(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_sid);
CREATE INDEX IF NOT EXISTS idx_call_turns_call_id_ts ON call_turns(call_id, ts);
CREATE INDEX IF NOT EXISTS idx_call_turns_role ON call_turns(role);
CREATE INDEX IF NOT EXISTS idx_tool_calls_call_id ON tool_calls(call_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_success ON tool_calls(success);

-- Recreate the analytics view with updated schema
CREATE OR REPLACE VIEW call_analytics AS
SELECT 
    c.id,
    c.tenant_id,
    c.started_at,
    c.ended_at,
    c.outcome,
    c.caller_number,
    CASE 
        WHEN c.ended_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) / 60 
        ELSE NULL 
    END AS duration_minutes,
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

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'CORA database migration completed successfully!';
    RAISE NOTICE 'All tables updated with required columns';
    RAISE NOTICE 'Existing data preserved where possible';
END $$;