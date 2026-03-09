-- ============================================================================
-- Migration: Add ION AP user tracking columns to companyAssignments table
-- Run this on existing databases to support ION AP user management.
-- ============================================================================

ALTER TABLE public."companyAssignments"
  ADD COLUMN IF NOT EXISTS "ionApUserId" integer,
  ADD COLUMN IF NOT EXISTS "ionApAuthToken" text,
  ADD COLUMN IF NOT EXISTS "ionApUserStatus" text DEFAULT 'pending' CHECK ("ionApUserStatus" IN ('pending', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS "ionApUserError" text;
