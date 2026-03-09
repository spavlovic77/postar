-- Migration: Add invitation tracking columns to companies
-- These track the auto-invitation sent after successful ION AP company registration.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS "invitationStatus" text CHECK ("invitationStatus" IN ('pending', 'success', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS "invitationError" text;

COMMENT ON COLUMN public.companies."invitationStatus" IS 'Status of the auto-invitation sent to adminEmail after ION AP registration';
COMMENT ON COLUMN public.companies."invitationError" IS 'Error message if auto-invitation failed';
