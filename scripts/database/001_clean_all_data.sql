-- ============================================================================
-- POSTAR - Clean All Data Script
-- WARNING: This will DELETE ALL data including auth users!
-- Use only for fresh installations or testing.
-- ============================================================================

-- Step 1: Clean public schema tables (respecting foreign key order)
TRUNCATE public."auditLogs" CASCADE;
TRUNCATE public.documents CASCADE;
TRUNCATE public."companyAssignments" CASCADE;
TRUNCATE public.invitations CASCADE;
TRUNCATE public.passkeys CASCADE;
TRUNCATE public.mfa_challenges CASCADE;
TRUNCATE public."accountDeactivationRequests" CASCADE;
TRUNCATE public.companies CASCADE;
TRUNCATE public."userRoles" CASCADE;
TRUNCATE public."accessPointProviders" CASCADE;

-- Step 2: Clean auth schema (Supabase Auth)
TRUNCATE auth.sessions CASCADE;
TRUNCATE auth.refresh_tokens CASCADE;
TRUNCATE auth.identities CASCADE;
TRUNCATE auth.users CASCADE;

-- ============================================================================
-- DATA CLEANUP COMPLETE
-- ============================================================================
-- 
-- All data has been removed. You can now:
-- 1. Run 000_master_schema.sql if tables need to be recreated
-- 2. Create your first superAdmin user via Supabase Auth
-- 3. Insert a record in userRoles for the superAdmin
-- ============================================================================
