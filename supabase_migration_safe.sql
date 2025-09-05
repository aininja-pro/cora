-- SAFE SUPABASE MIGRATION FOR CORA SMS NOTIFICATIONS
-- This script safely handles existing tables and adds missing columns/tables
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- SAFE TABLE CREATION/MODIFICATION
-- =============================================

-- Agents table (create if not exists)
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    company TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tenants table (create if not exists - needed first for foreign keys)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_display_name TEXT,
    brand_name TEXT,
    agent_phone TEXT,
    default_notification_number TEXT,
    sms_enabled BOOLEAN DEFAULT true,
    twilio_messaging_service_sid TEXT,
    sms_default_from TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table (create if not exists - needed for SMS compliance)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    source TEXT DEFAULT 'voice_call',
    sms_opt_out BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Check if calls table exists and modify it safely
DO $$
BEGIN
    -- Create calls table if it doesn't exist at all
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'calls') THEN
        CREATE TABLE calls (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
            call_sid TEXT UNIQUE,
            phone_number TEXT,
            caller_number TEXT,
            agent_number TEXT,
            twilio_sid TEXT,
            direction TEXT CHECK (direction IN ('inbound', 'outbound')),
            recording_url TEXT,
            transcript TEXT,
            duration INTEGER,
            call_status TEXT DEFAULT 'active',
            started_at TIMESTAMP WITH TIME ZONE,
            ended_at TIMESTAMP WITH TIME ZONE,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ELSE
        -- Table exists, add missing columns safely
        
        -- Add agent_id if missing (make it nullable first)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'agent_id') THEN
            ALTER TABLE calls ADD COLUMN agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
        END IF;
        
        -- Add caller_number if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'caller_number') THEN
            ALTER TABLE calls ADD COLUMN caller_number TEXT;
        END IF;
        
        -- Add agent_number if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'agent_number') THEN
            ALTER TABLE calls ADD COLUMN agent_number TEXT;
        END IF;
        
        -- Add twilio_sid if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'twilio_sid') THEN
            ALTER TABLE calls ADD COLUMN twilio_sid TEXT;
        END IF;
        
        -- Add call_status if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'call_status') THEN
            ALTER TABLE calls ADD COLUMN call_status TEXT DEFAULT 'active';
        END IF;
        
        -- Add started_at if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'started_at') THEN
            ALTER TABLE calls ADD COLUMN started_at TIMESTAMP WITH TIME ZONE;
        END IF;
        
        -- Add ended_at if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'ended_at') THEN
            ALTER TABLE calls ADD COLUMN ended_at TIMESTAMP WITH TIME ZONE;
        END IF;
        
    END IF;
END
$$;

-- Call transcripts table (needed for SMS triggers)
CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL, -- 'user' or 'assistant'
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table (main SMS table)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    to_number TEXT NOT NULL,
    template TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    provider_message_sid TEXT,
    idempotency_key TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Other existing tables (create if not exists)
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    price NUMERIC(12, 2),
    beds INTEGER,
    baths NUMERIC(3, 1),
    sqft INTEGER,
    type TEXT CHECK (type IN ('house', 'condo', 'townhouse', 'land', 'commercial', 'other')),
    description TEXT,
    photos TEXT[],
    status TEXT CHECK (status IN ('active', 'pending', 'sold', 'inactive')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    task_type TEXT,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')) DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS voice_transcriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    audio_url TEXT,
    transcript TEXT,
    confidence NUMERIC(3, 2),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_calls_call_sid ON calls(call_sid);
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_sid);
CREATE INDEX IF NOT EXISTS idx_calls_caller_number ON calls(caller_number);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_sequence ON call_transcripts(call_id, sequence_number);

-- SMS notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_call_id ON notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_to_number ON notifications(to_number);

-- Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_idem ON notifications(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Other table indexes
CREATE INDEX IF NOT EXISTS idx_listings_agent_id ON listings(agent_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_agent_id ON voice_transcriptions(agent_id);

-- =============================================
-- UTILITY FUNCTIONS AND TRIGGERS
-- =============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Create triggers (use DROP IF EXISTS for safety)
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at 
BEFORE UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at 
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at 
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at 
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SEED DATA
-- =============================================

-- Insert default tenant for testing
INSERT INTO tenants (id, name, agent_display_name, brand_name, agent_phone, sms_enabled)
VALUES ('default', 'Default Tenant', 'CORA Assistant', 'CORA Real Estate', '+15551234567', true)
ON CONFLICT (id) DO NOTHING;

-- Create a default agent if none exists
INSERT INTO agents (name, email, phone, company)
SELECT 'Default Agent', 'agent@cora.ai', '+15551234567', 'CORA Real Estate'
WHERE NOT EXISTS (SELECT 1 FROM agents LIMIT 1);

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Show all tables created
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('agents', 'tenants', 'contacts', 'calls', 'call_transcripts', 
                       'notifications', 'listings', 'tasks', 'voice_transcriptions')
ORDER BY table_name;

-- Show calls table structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'calls' 
ORDER BY ordinal_position;