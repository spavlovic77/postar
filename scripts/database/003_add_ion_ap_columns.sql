-- ============================================================================
-- Migration: Add ION AP tracking columns to companies table
-- Run this on existing databases to add ION AP integration support.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS "ionApOrgId" integer,
  ADD COLUMN IF NOT EXISTS "ionApIdentifierId" integer,
  ADD COLUMN IF NOT EXISTS "ionApStatus" text DEFAULT 'pending' CHECK ("ionApStatus" IN ('pending', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS "ionApError" text;
