-- Migration: Voice integration tables with idempotency and proper indexing
-- Idempotent and safe to re-run

-- Calls table (system of record)
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  twilio_sid TEXT NOT NULL,
  caller_number TEXT,
  agent_number TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  outcome TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL: Unique index for idempotent call creation
CREATE UNIQUE INDEX IF NOT EXISTS calls_twilio_sid_key ON calls(twilio_sid);
CREATE INDEX IF NOT EXISTS calls_tenant_started_idx ON calls(tenant_id, started_at DESC);

-- Call turns (structured timeline)
CREATE TABLE IF NOT EXISTS call_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('turn', 'tool_call', 'tool_result', 'status', 'summary')),
  role TEXT CHECK (role IN ('user', 'assistant')),
  text TEXT,
  ms INTEGER,
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL: Ordering index for timeline
CREATE INDEX IF NOT EXISTS call_turns_order_idx ON call_turns(call_id, ts, created_at);

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_call_turns_call_id'
    ) THEN
        ALTER TABLE call_turns ADD CONSTRAINT fk_call_turns_call_id 
        FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE;
    END IF;
END $$;