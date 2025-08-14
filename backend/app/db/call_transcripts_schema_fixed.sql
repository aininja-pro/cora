-- Enhanced Call Tracking Schema for CORA
-- This extends the existing calls table to capture detailed conversation data

-- Update calls table to include more detailed information
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_city TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_state TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_country TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'in_progress' 
    CHECK (call_status IN ('in_progress', 'completed', 'failed', 'missed'));
ALTER TABLE calls ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE;

-- Create call_transcripts table for detailed conversation tracking
CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL, -- Order of messages in conversation
    speaker TEXT CHECK (speaker IN ('user', 'assistant', 'system')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB, -- Additional data like confidence scores, interruptions, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create property_inquiries table to track what properties were discussed
CREATE TABLE IF NOT EXISTS property_inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    property_address TEXT,
    property_type TEXT,
    price_mentioned NUMERIC(12, 2),
    bedrooms INTEGER,
    bathrooms NUMERIC(3, 1),
    features_discussed TEXT[], -- Array of features mentioned (pool, garage, etc.)
    interest_level TEXT CHECK (interest_level IN ('low', 'medium', 'high', 'very_high')),
    scheduled_showing BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create lead_capture table for potential customers
CREATE TABLE IF NOT EXISTS lead_capture (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    name TEXT,
    email TEXT,
    preferred_contact_method TEXT CHECK (preferred_contact_method IN ('phone', 'email', 'text')),
    budget_range_min NUMERIC(12, 2),
    budget_range_max NUMERIC(12, 2),
    desired_bedrooms INTEGER,
    desired_location TEXT,
    timeline TEXT, -- When they're looking to buy/rent
    lead_score INTEGER CHECK (lead_score >= 0 AND lead_score <= 100),
    lead_status TEXT CHECK (lead_status IN ('new', 'contacted', 'qualified', 'nurturing', 'closed_won', 'closed_lost')) DEFAULT 'new',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance (with IF NOT EXISTS checks)
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id ON call_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_timestamp ON call_transcripts(timestamp);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_call_id ON property_inquiries(call_id);
CREATE INDEX IF NOT EXISTS idx_lead_capture_phone ON lead_capture(phone_number);
CREATE INDEX IF NOT EXISTS idx_lead_capture_status ON lead_capture(lead_status);
CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(call_status);

-- Add trigger for lead_capture updated_at (only if function exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lead_capture_updated_at') THEN
            CREATE TRIGGER update_lead_capture_updated_at BEFORE UPDATE ON lead_capture
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        END IF;
    END IF;
END $$;