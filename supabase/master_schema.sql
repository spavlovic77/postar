-- ============================================================
-- POSTAR - Master Schema
-- Run this in the Supabase SQL Editor
-- Drops everything and recreates from scratch + seeds superAdmin
-- ============================================================

-- ============================================================
-- 1. DROP ALL TABLES (reverse dependency order)
-- ============================================================
DROP TABLE IF EXISTS "auditLogs" CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS "companyAssignments" CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS "accountDeactivationRequests" CASCADE;
DROP TABLE IF EXISTS "userRoles" CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS "accessPointProviders" CASCADE;

-- ============================================================
-- 2. CREATE ALL TABLES
-- ============================================================

-- Access Point Providers
CREATE TABLE "accessPointProviders" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecret" TEXT NOT NULL,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dic TEXT NOT NULL UNIQUE,
  "legalName" TEXT,
  "adminEmail" TEXT,
  "peppolParticipantId" TEXT GENERATED ALWAYS AS ('0245:' || dic) STORED,
  "accessPointProviderId" UUID REFERENCES "accessPointProviders"(id),
  "createdById" UUID REFERENCES auth.users(id),
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- User Roles
CREATE TABLE "userRoles" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superAdmin', 'administrator', 'accountant')),
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE("userId")
);

-- Company Assignments
CREATE TABLE "companyAssignments" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  "companyId" UUID REFERENCES companies(id) ON DELETE CASCADE,
  "assignedById" UUID REFERENCES auth.users(id),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE("userId", "companyId")
);

-- Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" UUID REFERENCES companies(id),
  "providerDocumentId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "processId" TEXT NOT NULL,
  "senderParticipantId" TEXT NOT NULL,
  "receiverParticipantId" TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  status TEXT NOT NULL,
  "documentType" TEXT NOT NULL CHECK ("documentType" IN ('invoice', 'creditNote')),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "acknowledgedAt" TIMESTAMPTZ,
  "createdById" UUID REFERENCES auth.users(id)
);

-- Audit Logs (CEF format)
CREATE TABLE "auditLogs" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT now(),
  "userId" UUID REFERENCES auth.users(id),
  "companyId" UUID,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  "sourceIp" TEXT,
  "userAgent" TEXT,
  "requestMethod" TEXT,
  "requestPath" TEXT,
  "responseStatus" INTEGER,
  "correlationId" UUID,
  details JSONB,
  "cefVersion" TEXT DEFAULT 'CEF:0',
  "deviceVendor" TEXT DEFAULT 'SAPI-SK-Client',
  "deviceProduct" TEXT DEFAULT 'PeppolPlatform',
  "deviceVersion" TEXT DEFAULT '1.0',
  "signatureId" TEXT,
  severity INTEGER DEFAULT 5
);

-- Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'accountant')),
  "invitedBy" UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "companyIds" UUID[] DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- Account Deactivation Requests
CREATE TABLE "accountDeactivationRequests" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  "processedBy" UUID REFERENCES auth.users(id),
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. INDEXES
-- ============================================================
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_documents_company ON documents("companyId");
CREATE INDEX idx_audit_logs_user ON "auditLogs"("userId");
CREATE INDEX idx_audit_logs_timestamp ON "auditLogs"(timestamp);
CREATE INDEX idx_company_assignments_user ON "companyAssignments"("userId");
CREATE INDEX idx_company_assignments_company ON "companyAssignments"("companyId");

-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE "accessPointProviders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE "userRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companyAssignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auditLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accountDeactivationRequests" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- Access Point Providers: superAdmin full access
CREATE POLICY "Super admin full access to APs"
  ON "accessPointProviders" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Companies: users see assigned, superAdmin sees all
CREATE POLICY "Users can view assigned companies"
  ON companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "companyAssignments"
      WHERE "companyId" = companies.id AND "userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

CREATE POLICY "Admins can manage own companies"
  ON companies FOR ALL
  USING (
    "createdById" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- User Roles
CREATE POLICY "Users can view own role"
  ON "userRoles" FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "Super admin manages roles"
  ON "userRoles" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles" AS ur
      WHERE ur."userId" = auth.uid() AND ur.role = 'superAdmin'
    )
  );

-- Company Assignments
CREATE POLICY "Users can view own assignments"
  ON "companyAssignments" FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "Admins manage company assignments"
  ON "companyAssignments" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = "companyAssignments"."companyId"
      AND companies."createdById" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Documents
CREATE POLICY "Users can view documents of assigned companies"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "companyAssignments"
      WHERE "companyId" = documents."companyId" AND "userId" = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

CREATE POLICY "Users can insert documents for assigned companies"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "companyAssignments"
      WHERE "companyId" = documents."companyId" AND "userId" = auth.uid()
    )
  );

-- Audit Logs
CREATE POLICY "Super admin views audit logs"
  ON "auditLogs" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

CREATE POLICY "Authenticated users can insert audit logs"
  ON "auditLogs" FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Invitations
CREATE POLICY "Super admin full access to invitations"
  ON invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

CREATE POLICY "Admins can manage own invitations"
  ON invitations FOR ALL
  USING (
    "invitedBy" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Account Deactivation Requests
CREATE POLICY "Super admin full access to deactivation requests"
  ON "accountDeactivationRequests" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

CREATE POLICY "Users can view own deactivation requests"
  ON "accountDeactivationRequests" FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "Users can create deactivation requests"
  ON "accountDeactivationRequests" FOR INSERT
  WITH CHECK ("userId" = auth.uid());

-- ============================================================
-- 6. SEED SUPER ADMIN
-- ============================================================
-- Create the auth user via Supabase Auth API, then assign superAdmin role.
-- NOTE: Run this AFTER creating the user in Supabase Dashboard or via:
--   Authentication > Users > Add User > Email: stanislav.pavlovic1@gmail.com, Password: .Speedo2217
--
-- Once the user exists in auth.users, run:

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to find the user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'stanislav.pavlovic1@gmail.com';

  -- If user not found, create via raw insert (Supabase managed auth)
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      role,
      aud,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'stanislav.pavlovic1@gmail.com',
      crypt('.Speedo2217', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated',
      now(),
      now(),
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_user_id,
      'stanislav.pavlovic1@gmail.com',
      'email',
      jsonb_build_object('sub', v_user_id::text, 'email', 'stanislav.pavlovic1@gmail.com'),
      now(),
      now(),
      now()
    );
  END IF;

  -- Assign superAdmin role
  INSERT INTO "userRoles" ("userId", role, "isActive")
  VALUES (v_user_id, 'superAdmin', true)
  ON CONFLICT ("userId") DO UPDATE SET role = 'superAdmin', "isActive" = true;

  RAISE NOTICE 'SuperAdmin created: % (stanislav.pavlovic1@gmail.com)', v_user_id;
END $$;
