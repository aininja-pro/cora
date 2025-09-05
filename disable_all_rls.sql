-- DISABLE ALL RLS TO RESTORE UI FUNCTIONALITY
-- This will restore your working UI immediately

ALTER TABLE calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_transcripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE listings DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcriptions DISABLE ROW LEVEL SECURITY;

-- Keep RLS only on new SMS tables for compliance
-- tenants, contacts, notifications keep their RLS

-- Drop all policies that might be blocking access
DROP POLICY IF EXISTS calls_service_full ON calls;
DROP POLICY IF EXISTS calls_tenant_select ON calls;
DROP POLICY IF EXISTS call_transcripts_service_full ON call_transcripts;

-- Verify all core tables have RLS disabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('calls', 'call_transcripts', 'agents', 'listings')
ORDER BY tablename;