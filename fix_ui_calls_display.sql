-- FIX UI CALLS DISPLAY - Remove RLS blocking
-- The UI can't see calls because of RLS policies

-- Disable RLS on calls table so UI can read calls
ALTER TABLE calls DISABLE ROW LEVEL SECURITY;

-- Disable RLS on call_transcripts table so UI can read transcripts  
ALTER TABLE call_transcripts DISABLE ROW LEVEL SECURITY;

-- Keep RLS only on SMS-specific tables
-- ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Verify RLS status
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('calls', 'call_transcripts', 'contacts', 'notifications');