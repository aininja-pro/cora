-- INSPECT EXISTING STRUCTURE FIRST
-- Run this to see what columns your calls table currently has
-- Then we'll create a proper migration

-- =============================================
-- STEP 1: INSPECT CURRENT STRUCTURE
-- =============================================

-- Show all existing tables
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Show current calls table structure (if it exists)
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'calls' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show current indexes on calls table
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'calls' AND schemaname = 'public';

-- Show any foreign key constraints
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'calls' AND tc.table_schema = 'public';