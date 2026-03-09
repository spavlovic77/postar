-- ============================================================================
-- POSTAR - Master Database Schema
-- Version: 1.0.0
-- Generated: 2026-03-09
-- 
-- This file contains the complete database schema for a fresh installation.
-- Run this script on a clean Supabase project to set up all tables, indexes,
-- RLS policies, and helper functions.
-- ============================================================================

-- ============================================================================
-- PART 1: CLEAN UP (Optional - for fresh installs)
-- WARNING: This will delete ALL data including auth users!
-- ============================================================================

-- Uncomment these lines ONLY for a completely fresh install:
-- TRUNCATE public."userRoles" CASCADE;
-- TRUNCATE public."companyAssignments" CASCADE;
-- TRUNCATE public.companies CASCADE;
-- TRUNCATE public.invitations CASCADE;
-- TRUNCATE public.passkeys CASCADE;
-- TRUNCATE public."auditLogs" CASCADE;
-- TRUNCATE public.documents CASCADE;
-- TRUNCATE public."accessPointProviders" CASCADE;
-- TRUNCATE public."accountDeactivationRequests" CASCADE;
-- TRUNCATE public.mfa_challenges CASCADE;
-- TRUNCATE auth.sessions CASCADE;
-- TRUNCATE auth.refresh_tokens CASCADE;
-- TRUNCATE auth.identities CASCADE;
-- TRUNCATE auth.users CASCADE;

-- ============================================================================
-- PART 2: HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."userRoles"
    WHERE "userId" = auth.uid()
    AND role = 'superAdmin'
    AND "isActive" = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is an administrator
CREATE OR REPLACE FUNCTION is_administrator()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."userRoles"
    WHERE "userId" = auth.uid()
    AND role = 'administrator'
    AND "isActive" = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is an accountant
CREATE OR REPLACE FUNCTION is_accountant()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."userRoles"
    WHERE "userId" = auth.uid()
    AND role = 'accountant'
    AND "isActive" = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public."userRoles"
  WHERE "userId" = auth.uid()
  AND "isActive" = true
  LIMIT 1;
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3: TABLES
-- ============================================================================

-- User Roles Table
CREATE TABLE IF NOT EXISTS public."userRoles" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superAdmin', 'administrator', 'accountant')),
  "isActive" boolean DEFAULT true,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  UNIQUE("userId")
);

-- Companies Table
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dic text NOT NULL UNIQUE,
  "legalName" text,
  "adminEmail" text,
  "adminPhone" text,
  "peppolParticipantId" text,
  "accessPointProviderId" uuid REFERENCES public."accessPointProviders"(id),
  "createdById" uuid REFERENCES auth.users(id),
  "isActive" boolean DEFAULT true,
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'suspended')),
  "pfsVerificationToken" text,
  "ionApOrgId" integer,
  "ionApIdentifierId" integer,
  "ionApStatus" text DEFAULT 'pending' CHECK ("ionApStatus" IN ('pending', 'success', 'failed')),
  "ionApError" text,
  "invitationStatus" text CHECK ("invitationStatus" IN ('pending', 'success', 'failed', 'skipped')),
  "invitationError" text,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- Company Assignments Table (links users to companies)
CREATE TABLE IF NOT EXISTS public."companyAssignments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "companyId" uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  "assignedById" uuid REFERENCES auth.users(id),
  "ionApUserId" integer,
  "ionApAuthToken" text,
  "ionApUserStatus" text DEFAULT 'pending' CHECK ("ionApUserStatus" IN ('pending', 'success', 'failed')),
  "ionApUserError" text,
  "createdAt" timestamptz DEFAULT now(),
  UNIQUE("userId", "companyId")
);

-- Invitations Table
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('superAdmin', 'administrator', 'accountant')),
  token text NOT NULL UNIQUE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "invitedBy" uuid REFERENCES auth.users(id),
  "invitedByRole" text,
  "companyIds" uuid[] DEFAULT '{}',
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now()
);

-- Passkeys Table (WebAuthn/MFA)
CREATE TABLE IF NOT EXISTS public.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "credentialId" text NOT NULL UNIQUE,
  "publicKey" text NOT NULL,
  counter integer DEFAULT 0,
  "deviceType" text,
  "backedUp" boolean DEFAULT false,
  transports text[],
  "aaguid" text,
  name text,
  "createdAt" timestamptz DEFAULT now(),
  "lastUsedAt" timestamptz
);

-- MFA Challenges Table (temporary challenge storage)
CREATE TABLE IF NOT EXISTS public.mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now(),
  UNIQUE("userId")
);

-- Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  "uploadedBy" uuid REFERENCES auth.users(id),
  filename text NOT NULL,
  "originalName" text,
  "mimeType" text,
  size integer,
  path text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  "sapiSkResponse" jsonb,
  "sapiSkId" text,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- Access Point Providers Table (SAPI SK integration)
CREATE TABLE IF NOT EXISTS public."accessPointProviders" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  "baseUrl" text NOT NULL,
  "clientId" text NOT NULL,
  "clientSecret" text NOT NULL,
  "isActive" boolean DEFAULT true,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- Account Deactivation Requests Table
CREATE TABLE IF NOT EXISTS public."accountDeactivationRequests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  "processedBy" uuid REFERENCES auth.users(id),
  "processedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS public."auditLogs" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid,
  "companyId" uuid,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'pending')),
  "sourceIp" text,
  "userAgent" text,
  "requestMethod" text,
  "requestPath" text,
  "responseStatus" integer,
  "correlationId" text,
  details jsonb,
  timestamp timestamptz DEFAULT now()
);

-- ============================================================================
-- PART 4: INDEXES
-- ============================================================================

-- User Roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public."userRoles"("userId");

-- Company Assignments
CREATE INDEX IF NOT EXISTS idx_company_assignments_user ON public."companyAssignments"("userId");
CREATE INDEX IF NOT EXISTS idx_company_assignments_company ON public."companyAssignments"("companyId");

-- Invitations
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);

-- Passkeys
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON public.passkeys("userId");
CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON public.passkeys("credentialId");

-- MFA Challenges
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_id ON public.mfa_challenges("userId");
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON public.mfa_challenges("expiresAt");

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_company ON public.documents("companyId");

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public."auditLogs"("userId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public."auditLogs"(timestamp);

-- ============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public."userRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."companyAssignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."accessPointProviders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."accountDeactivationRequests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auditLogs" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: RLS POLICIES
-- ============================================================================

-- Drop existing policies first (for idempotency)
DROP POLICY IF EXISTS "Super admin full access to user roles" ON public."userRoles";
DROP POLICY IF EXISTS "Users can view own role" ON public."userRoles";
DROP POLICY IF EXISTS "Super admin full access to companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can manage own companies" ON public.companies;
DROP POLICY IF EXISTS "Accountants view assigned companies" ON public.companies;
DROP POLICY IF EXISTS "Super admin full access to assignments" ON public."companyAssignments";
DROP POLICY IF EXISTS "Users view own assignments" ON public."companyAssignments";
DROP POLICY IF EXISTS "Super admin full access to invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users manage own passkeys" ON public.passkeys;
DROP POLICY IF EXISTS "Service role only" ON public.mfa_challenges;
DROP POLICY IF EXISTS "Users access own documents" ON public.documents;
DROP POLICY IF EXISTS "Super admin full access to documents" ON public.documents;
DROP POLICY IF EXISTS "Super admin full access to APs" ON public."accessPointProviders";
DROP POLICY IF EXISTS "Super admin full access to deactivation requests" ON public."accountDeactivationRequests";
DROP POLICY IF EXISTS "Users can create deactivation requests" ON public."accountDeactivationRequests";
DROP POLICY IF EXISTS "Users can view own deactivation requests" ON public."accountDeactivationRequests";
DROP POLICY IF EXISTS "Super admin views audit logs" ON public."auditLogs";
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public."auditLogs";

-- User Roles Policies
CREATE POLICY "Super admin full access to user roles" ON public."userRoles"
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can view own role" ON public."userRoles"
  FOR SELECT USING ("userId" = auth.uid());

-- Companies Policies
CREATE POLICY "Super admin full access to companies" ON public.companies
  FOR ALL USING (is_super_admin());

CREATE POLICY "Admins can manage own companies" ON public.companies
  FOR ALL USING (
    "createdById" = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public."companyAssignments"
      WHERE "companyAssignments"."companyId" = companies.id
      AND "companyAssignments"."userId" = auth.uid()
    )
  );

CREATE POLICY "Accountants view assigned companies" ON public.companies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public."companyAssignments"
      WHERE "companyAssignments"."companyId" = companies.id
      AND "companyAssignments"."userId" = auth.uid()
    )
  );

-- Company Assignments Policies
CREATE POLICY "Super admin full access to assignments" ON public."companyAssignments"
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users view own assignments" ON public."companyAssignments"
  FOR SELECT USING ("userId" = auth.uid());

-- Invitations Policies
CREATE POLICY "Super admin full access to invitations" ON public.invitations
  FOR ALL USING (is_super_admin());

CREATE POLICY "Admins can manage invitations" ON public.invitations
  FOR ALL USING (
    "invitedBy" = auth.uid() OR
    is_administrator()
  );

-- Passkeys Policies
CREATE POLICY "Users manage own passkeys" ON public.passkeys
  FOR ALL USING ("userId" = auth.uid());

-- MFA Challenges Policies (service role only - no user access)
CREATE POLICY "Service role only" ON public.mfa_challenges
  FOR ALL USING (false) WITH CHECK (false);

-- Documents Policies
CREATE POLICY "Users access own documents" ON public.documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public."companyAssignments"
      WHERE "companyAssignments"."companyId" = documents."companyId"
      AND "companyAssignments"."userId" = auth.uid()
    )
  );

CREATE POLICY "Super admin full access to documents" ON public.documents
  FOR ALL USING (is_super_admin());

-- Access Point Providers Policies
CREATE POLICY "Super admin full access to APs" ON public."accessPointProviders"
  FOR ALL USING (is_super_admin());

-- Account Deactivation Requests Policies
CREATE POLICY "Super admin full access to deactivation requests" ON public."accountDeactivationRequests"
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can create deactivation requests" ON public."accountDeactivationRequests"
  FOR INSERT WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Users can view own deactivation requests" ON public."accountDeactivationRequests"
  FOR SELECT USING ("userId" = auth.uid());

-- Audit Logs Policies
CREATE POLICY "Super admin views audit logs" ON public."auditLogs"
  FOR SELECT USING (is_super_admin());

CREATE POLICY "Authenticated users can insert audit logs" ON public."auditLogs"
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant permissions on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_administrator() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_accountant() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO anon, authenticated;

-- ============================================================================
-- INSTALLATION COMPLETE
-- ============================================================================
-- 
-- After running this script:
-- 1. Create your first superAdmin user via Supabase Auth
-- 2. Insert a record in userRoles: 
--    INSERT INTO "userRoles" ("userId", role, "isActive") 
--    VALUES ('<user-uuid>', 'superAdmin', true);
-- 3. Configure your access point provider if using SAPI SK
-- ============================================================================
