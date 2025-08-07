-- Update calls table to include all necessary columns
-- Run this in your Supabase SQL editor

-- First, check if the table exists and what columns it has
-- If it doesn't exist, create it:
CREATE TABLE IF NOT EXISTS calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number TEXT,
    transcript TEXT,
    status TEXT DEFAULT 'active',
    duration INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add missing columns if they don't exist
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS ai_response TEXT,
ADD COLUMN IF NOT EXISTS property_mentioned TEXT,
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS call_id TEXT,
ADD COLUMN IF NOT EXISTS caller_name TEXT;

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_phone_number ON calls(phone_number);

-- Grant permissions for the service role
GRANT ALL ON calls TO postgres;
GRANT ALL ON calls TO anon;
GRANT ALL ON calls TO authenticated;
GRANT ALL ON calls TO service_role;