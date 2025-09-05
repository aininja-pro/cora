-- SUPABASE RLS POLICIES FOR SMS NOTIFICATIONS
-- Run this AFTER the main schema has been created successfully
-- This enables Row Level Security for tenant isolation

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- DROP EXISTING POLICIES (if they exist)
-- =============================================

DROP POLICY IF EXISTS tenants_service_full ON tenants;
DROP POLICY IF EXISTS contacts_service_full ON contacts;
DROP POLICY IF EXISTS calls_service_full ON calls;
DROP POLICY IF EXISTS call_transcripts_service_full ON call_transcripts;
DROP POLICY IF EXISTS notifications_service_full ON notifications;
DROP POLICY IF EXISTS notifications_tenant_select ON notifications;
DROP POLICY IF EXISTS calls_tenant_select ON calls;

-- =============================================
-- CREATE NEW POLICIES
-- =============================================

-- Service role gets full access for backend operations
CREATE POLICY tenants_service_full
ON tenants FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY contacts_service_full
ON contacts FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY calls_service_full
ON calls FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY call_transcripts_service_full
ON call_transcripts FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_full
ON notifications FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Authenticated users get tenant-scoped read access (for UI)
CREATE POLICY notifications_tenant_select
ON notifications FOR SELECT TO authenticated
USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY calls_tenant_select  
ON calls FOR SELECT TO authenticated
USING (true); -- Adjust this based on your tenant model

-- =============================================
-- VERIFICATION
-- =============================================

-- Check that RLS is enabled on all tables
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('tenants', 'contacts', 'calls', 'call_transcripts', 'notifications')
ORDER BY tablename;

-- Check that policies were created
SELECT 
    schemaname,
    tablename, 
    policyname,
    roles,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('tenants', 'contacts', 'calls', 'call_transcripts', 'notifications')
ORDER BY tablename, policyname;