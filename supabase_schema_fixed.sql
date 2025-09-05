-- COMPLETE CORA SUPABASE SCHEMA (FIXED)
-- Run this entire script in Supabase SQL Editor
-- Fixed: Removed IF NOT EXISTS from CREATE POLICY statements

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- EXISTING CORE TABLES (from your schema.sql)
-- =============================================

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    company TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Listings table  
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

-- Tasks table
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

-- Calls table (enhanced for voice integration)
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    call_sid TEXT UNIQUE,
    phone_number TEXT,
    caller_number TEXT, -- Added for SMS triggers
    agent_number TEXT,  -- Added for routing
    twilio_sid TEXT,    -- Added for Twilio integration
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    recording_url TEXT,
    transcript TEXT,
    duration INTEGER,
    call_status TEXT DEFAULT 'active', -- Added for call lifecycle
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Voice transcriptions table
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
-- NEW TABLES FOR SMS NOTIFICATIONS
-- =============================================

-- Tenants table (multi-tenancy support)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, -- Using text for simplicity in MVP
    name TEXT NOT NULL,
    agent_display_name TEXT,
    brand_name TEXT,
    agent_phone TEXT, -- For SMS notifications to agents
    default_notification_number TEXT, -- Fallback SMS number
    sms_enabled BOOLEAN DEFAULT true,
    twilio_messaging_service_sid TEXT,
    sms_default_from TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table (for SMS opt-out compliance)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    source TEXT DEFAULT 'voice_call', -- voice_call, sms_inbound, etc.
    sms_opt_out BOOLEAN DEFAULT false, -- CRITICAL for compliance
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Call transcripts table (for conversation history)
CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL, -- 'user' or 'assistant'
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table (SMS tracking and compliance)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    to_number TEXT NOT NULL,
    template TEXT NOT NULL, -- 'showing_confirm', 'agent_summary', 'lead_captured', 'missed_call'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'failed'
    error TEXT,
    provider_message_sid TEXT, -- Twilio message SID for tracking
    idempotency_key TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Original indexes
CREATE INDEX IF NOT EXISTS idx_listings_agent_id ON listings(agent_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_agent_id ON voice_transcriptions(agent_id);

-- New indexes for SMS notifications
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_sid);
CREATE INDEX IF NOT EXISTS idx_calls_caller_number ON calls(caller_number);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_sequence ON call_transcripts(call_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_notifications_call_id ON notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_call_created ON notifications(call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_to_number ON notifications(to_number);

-- Unique index for idempotency (partial index where key exists)
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_idem ON notifications(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

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

-- Create triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at 
BEFORE UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at 
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at 
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at 
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SEED DATA (Optional - for testing)
-- =============================================

-- Insert default tenant for testing
INSERT INTO tenants (id, name, agent_display_name, brand_name, agent_phone, sms_enabled)
VALUES ('default', 'Default Tenant', 'CORA Assistant', 'CORA Real Estate', '+15551234567', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE tenants IS 'Multi-tenant configuration with SMS settings';
COMMENT ON TABLE contacts IS 'Contact information with SMS opt-out compliance';
COMMENT ON TABLE call_transcripts IS 'Individual messages from voice conversations';
COMMENT ON TABLE notifications IS 'SMS notifications sent via Twilio with compliance tracking';

COMMENT ON COLUMN tenants.sms_enabled IS 'Master SMS toggle for tenant';
COMMENT ON COLUMN contacts.sms_opt_out IS 'User opted out of SMS (STOP compliance)';
COMMENT ON COLUMN notifications.template IS 'Template key: showing_confirm, agent_summary, lead_captured, missed_call';
COMMENT ON COLUMN notifications.payload IS 'JSON data for template rendering (name, address, etc.)';
COMMENT ON COLUMN notifications.status IS 'Delivery status: queued, sent, failed';
COMMENT ON COLUMN notifications.provider_message_sid IS 'Twilio message SID for delivery tracking';
COMMENT ON COLUMN notifications.idempotency_key IS 'Prevents duplicate sends for same business event';