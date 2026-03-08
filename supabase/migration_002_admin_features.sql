-- Migration 002: Super Admin Features
-- Run this after migration.sql in the Supabase SQL Editor

-- 1. Modify companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS "legalName" TEXT,
ADD COLUMN IF NOT EXISTS "adminEmail" TEXT;

-- 2. Modify userRoles table
ALTER TABLE "userRoles"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

-- 3. Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'accountant')),
  "invitedBy" UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "companyIds" UUID[] DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- 4. Create accountDeactivationRequests table
CREATE TABLE IF NOT EXISTS "accountDeactivationRequests" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES auth.users(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  "processedBy" UUID REFERENCES auth.users(id),
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable RLS on new tables
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accountDeactivationRequests" ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for invitations

-- SuperAdmin can manage all invitations
CREATE POLICY "Super admin full access to invitations"
  ON invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Administrators can view/create invitations they made
CREATE POLICY "Admins can manage own invitations"
  ON invitations FOR ALL
  USING (
    "invitedBy" = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- 7. RLS Policies for accountDeactivationRequests

-- SuperAdmin can manage all deactivation requests
CREATE POLICY "Super admin full access to deactivation requests"
  ON "accountDeactivationRequests" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "userRoles"
      WHERE "userId" = auth.uid() AND role = 'superAdmin'
    )
  );

-- Users can create and view their own requests
CREATE POLICY "Users can manage own deactivation requests"
  ON "accountDeactivationRequests" FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "Users can create deactivation requests"
  ON "accountDeactivationRequests" FOR INSERT
  WITH CHECK ("userId" = auth.uid());
