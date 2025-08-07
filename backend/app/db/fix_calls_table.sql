-- Complete fix for calls table
-- Run this entire script in Supabase SQL Editor

-- Drop and recreate the table with all needed columns
DROP TABLE IF EXISTS calls CASCADE;

CREATE TABLE calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id TEXT,
    phone_number TEXT,
    caller_name TEXT,
    transcript TEXT,
    ai_response TEXT,
    property_mentioned TEXT,
    lead_score INTEGER DEFAULT 50,
    status TEXT DEFAULT 'active',
    duration INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better performance
CREATE INDEX idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX idx_calls_phone_number ON calls(phone_number);
CREATE INDEX idx_calls_status ON calls(status);

-- Enable Row Level Security
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now
CREATE POLICY "Allow all operations on calls" ON calls
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON calls TO postgres;
GRANT ALL ON calls TO anon;
GRANT ALL ON calls TO authenticated;
GRANT ALL ON calls TO service_role;

-- Insert a test call to verify it works
INSERT INTO calls (
    phone_number,
    transcript,
    ai_response,
    property_mentioned,
    lead_score,
    status
) VALUES (
    '+1234567890',
    'Test call transcript',
    'Test AI response',
    '123 Main Street',
    75,
    'completed'
);

-- Verify the table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'calls' 
ORDER BY ordinal_position;