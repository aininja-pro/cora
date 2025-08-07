-- COMPLETE DATABASE FIX FOR CORA
-- Run this entire script in Supabase SQL Editor

-- Step 1: Check what columns exist in the current calls table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'calls' 
ORDER BY ordinal_position;

-- Step 2: Add missing columns (won't error if they already exist)
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS call_id TEXT,
ADD COLUMN IF NOT EXISTS ai_response TEXT,
ADD COLUMN IF NOT EXISTS property_mentioned TEXT,
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS caller_name TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

-- Step 3: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_phone_number ON calls(phone_number);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

-- Step 4: Enable RLS if not already enabled
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Step 5: Create or replace the policy
DROP POLICY IF EXISTS "Allow all operations on calls" ON calls;
CREATE POLICY "Allow all operations on calls" ON calls
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

-- Step 6: Grant permissions
GRANT ALL ON calls TO postgres;
GRANT ALL ON calls TO anon;
GRANT ALL ON calls TO authenticated;
GRANT ALL ON calls TO service_role;

-- Step 7: Check if listings table has the properties we expect
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'listings' 
ORDER BY ordinal_position;

-- Step 8: Verify our test data exists
SELECT * FROM listings WHERE LOWER(address) LIKE '%123 main%';

-- Step 9: If no test data, let's check what addresses we DO have
SELECT address, price, beds, baths FROM listings LIMIT 10;

-- Step 10: Insert a test call to verify everything works
INSERT INTO calls (
    call_id,
    phone_number,
    transcript,
    ai_response,
    property_mentioned,
    lead_score,
    status,
    duration
) VALUES (
    'test-' || gen_random_uuid()::text,
    '+1234567890',
    'I am interested in viewing the property at 123 Main Street',
    'I would be happy to schedule a showing for 123 Main Street. When would work best for you?',
    '123 Main Street',
    85,
    'completed',
    120
) ON CONFLICT DO NOTHING;

-- Step 11: Verify the insert worked
SELECT * FROM calls ORDER BY created_at DESC LIMIT 1;