-- ADD MISSING SMS TABLES TO EXISTING CORA DATABASE
-- Since you already have: agents, calls, call_transcripts, listings, tasks
-- We only need to add: tenants, contacts, notifications + missing columns

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ADD MISSING SMS-SPECIFIC TABLES
-- =============================================

-- Tenants table (multi-tenancy for SMS settings)
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
    source TEXT DEFAULT 'voice_call',
    sms_opt_out BOOLEAN DEFAULT false, -- CRITICAL for STOP compliance
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table (SMS tracking)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    to_number TEXT NOT NULL,
    template TEXT NOT NULL, -- 'showing_confirm', 'agent_summary', 'lead_captured'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'failed'
    error TEXT,
    provider_message_sid TEXT, -- Twilio message SID
    idempotency_key TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- =============================================

-- Add SMS-related columns to existing calls table (if missing)
DO $$
BEGIN
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
END
$$;

-- Add SMS opt-out to contacts if they don't have it
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'sms_opt_out') THEN
        ALTER TABLE contacts ADD COLUMN sms_opt_out BOOLEAN DEFAULT false;
    END IF;
END
$$;

-- =============================================
-- INDEXES FOR PERFORMANCE  
-- =============================================

-- SMS notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_call_id ON notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_to_number ON notifications(to_number);

-- Idempotency index
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_idem ON notifications(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Contact indexes
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

-- Call indexes for SMS triggers
CREATE INDEX IF NOT EXISTS idx_calls_caller_number ON calls(caller_number);
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_sid);

-- =============================================
-- UTILITY FUNCTIONS AND TRIGGERS
-- =============================================

-- Updated_at trigger function (may already exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Triggers for new tables
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
COMMENT ON TABLE notifications IS 'SMS notifications sent via Twilio with compliance tracking';

COMMENT ON COLUMN tenants.sms_enabled IS 'Master SMS toggle for tenant';
COMMENT ON COLUMN contacts.sms_opt_out IS 'User opted out of SMS (STOP compliance)';
COMMENT ON COLUMN notifications.template IS 'Template key: showing_confirm, agent_summary, lead_captured';
COMMENT ON COLUMN notifications.idempotency_key IS 'Prevents duplicate sends for same business event';

-- =============================================
-- VERIFICATION
-- =============================================

-- Show final table count
SELECT 
    'SUCCESS: SMS tables added' as status,
    COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Show the new SMS tables
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('tenants', 'notifications') THEN 'NEW - Added for SMS'
        WHEN table_name = 'contacts' AND EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'contacts' AND column_name = 'sms_opt_out'
        ) THEN 'UPDATED - Added SMS compliance'
        ELSE 'EXISTING'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('tenants', 'contacts', 'notifications', 'calls', 'call_transcripts', 'agents')
ORDER BY table_name;