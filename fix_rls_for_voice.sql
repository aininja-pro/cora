-- FIX RLS POLICIES FOR VOICE SYSTEM
-- The voice system needs to write transcripts without RLS blocking it

-- Temporarily disable RLS on call_transcripts to unblock voice system
ALTER TABLE call_transcripts DISABLE ROW LEVEL SECURITY;

-- Or alternatively, create a more permissive policy for the voice system
-- (Run this if you want to keep RLS enabled)

-- DROP POLICY IF EXISTS call_transcripts_service_full ON call_transcripts;
-- 
-- CREATE POLICY call_transcripts_service_full
-- ON call_transcripts FOR ALL
-- USING (true)
-- WITH CHECK (true);

-- Verification: Check RLS status
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'call_transcripts';