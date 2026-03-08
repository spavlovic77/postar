-- SAPI-SK Postar Platform - Database Schema
-- Run this migration in the Supabase SQL Editor

-- Access Point Providers (configured by Super Admin)
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

-- Companies (Peppol participants)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dic TEXT NOT NULL UNIQUE,
  "peppolParticipantId" TEXT GENERATED ALWAYS AS ('0245:' || dic) STORED,
  "accessPointProviderId" UUID REFERENCES "accessPointProviders"(id),
  "createdById" UUID REFERENCES auth.users(id),
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- User roles
CREATE TABLE "userRoles" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superAdmin', 'administrator', 'accountant')),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE("userId")
);

-- Company assignments (which users can access which companies)
CREATE TABLE "companyAssignments" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  "companyId" UUID REFERENCES companies(id) ON DELETE CASCADE,
  "assignedById" UUID REFERENCES auth.users(id),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE("userId", "companyId")
);

-- Document metadata
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

-- CEF Audit Log
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

-- Enable RLS on all tables
ALTER TABLE "accessPointProviders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE "userRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companyAssignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auditLogs" ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Super Admin can see all AP providers
CREATE POLICY "Super admin full access to APs"
  ON "accessPointProviders" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Users can see companies they are assigned to
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

-- Administrators can manage companies they created
CREATE POLICY "Admins can manage own companies"
  ON companies FOR ALL
  USING (
    "createdById" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Users can view their own role
CREATE POLICY "Users can view own role"
  ON "userRoles" FOR SELECT
  USING ("userId" = auth.uid());

-- Super admin can manage all roles
CREATE POLICY "Super admin manages roles"
  ON "userRoles" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles" AS ur
      WHERE ur."userId" = auth.uid() AND ur.role = 'superAdmin'
    )
  );

-- Users can see their own assignments
CREATE POLICY "Users can view own assignments"
  ON "companyAssignments" FOR SELECT
  USING ("userId" = auth.uid());

-- Admins can manage assignments for their companies
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

-- Document access based on company assignment
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

-- Users can insert documents for assigned companies
CREATE POLICY "Users can insert documents for assigned companies"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "companyAssignments"
      WHERE "companyId" = documents."companyId" AND "userId" = auth.uid()
    )
  );

-- Super admin can view all audit logs
CREATE POLICY "Super admin views audit logs"
  ON "auditLogs" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Any authenticated user can insert audit logs
CREATE POLICY "Authenticated users can insert audit logs"
  ON "auditLogs" FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
