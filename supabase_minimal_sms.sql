-- MINIMAL SMS NOTIFICATION SETUP
-- This script creates ONLY the SMS-related tables without touching existing ones
-- Run this first, then we'll add missing columns to existing tables separately

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CORE SMS TABLES ONLY
-- =============================================

-- Tenants table (multi-tenancy support)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
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
-- This references calls.id but doesn't require specific structure
CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID, -- Will add foreign key constraint later if calls table is compatible
    speaker TEXT NOT NULL, -- 'user' or 'assistant'
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table (SMS tracking and compliance)
-- This references both tenants and calls tables
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    call_id UUID, -- Will add foreign key constraint later if calls table is compatible
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
-- INDEXES FOR NEW TABLES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_sequence ON call_transcripts(call_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_notifications_call_id ON notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_to_number ON notifications(to_number);

-- Unique index for idempotency
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

-- Create triggers for new tables
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at 
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at 
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SEED DATA
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

-- =============================================
-- VERIFICATION
-- =============================================

-- Show what we created
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('tenants', 'contacts', 'call_transcripts', 'notifications')
ORDER BY table_name;

-- Check if calls table exists and show its structure
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'calls') 
        THEN 'calls table EXISTS - check its structure with the inspect script'
        ELSE 'calls table MISSING - you may need to create it'
    END as calls_status;