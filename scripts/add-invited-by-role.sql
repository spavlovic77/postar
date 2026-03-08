-- Add invitedByRole column to invitations table
-- This tracks which role invited the user for audit purposes

ALTER TABLE "invitations"
ADD COLUMN IF NOT EXISTS "invitedByRole" TEXT;

-- Update existing invitations to have the inviter's role
UPDATE "invitations" i
SET "invitedByRole" = (
  SELECT role FROM "userRoles" ur WHERE ur."userId" = i."invitedBy"
)
WHERE "invitedByRole" IS NULL;
