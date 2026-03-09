-- =====================================================
-- SEED DATA - Run after schema creation
-- =====================================================
--
-- INSTRUCTIONS:
-- 1. First create the superAdmin user in Supabase Dashboard:
--    Authentication > Users > Add User
--    - Email: YOUR_EMAIL
--    - Password: YOUR_PASSWORD
--    - Check "Auto Confirm User"
--
-- 2. Then run this script with the email you used
-- =====================================================

-- =====================================================
-- STEP 1: CREATE SUPER ADMIN ROLE
-- =====================================================
-- Replace 'YOUR_EMAIL@example.com' with the email you used in Supabase Dashboard

INSERT INTO "userRoles" ("userId", role, "isActive")
SELECT id, 'superAdmin', true
FROM auth.users
WHERE email = 'YOUR_EMAIL@example.com'  -- <-- CHANGE THIS
ON CONFLICT ("userId") DO UPDATE SET role = 'superAdmin', "isActive" = true;

-- Verify superAdmin was created
SELECT
  u.id,
  u.email,
  ur.role,
  ur."isActive",
  u.created_at
FROM auth.users u
JOIN "userRoles" ur ON ur."userId" = u.id
WHERE ur.role = 'superAdmin';

-- =====================================================
-- STEP 2: SEED ACCESS POINT PROVIDERS (Optional)
-- =====================================================
-- Uncomment and configure for your ION AP setup

-- INSERT INTO "accessPointProviders" (name, "baseUrl", "clientId", "clientSecret", "isActive")
-- VALUES
--  ('ION AP - Production', 'https://api.ionap.example.com/api/v2', 'your-client-id', 'your-client-secret', true)
-- ON CONFLICT DO NOTHING;

-- =====================================================
-- STEP 3: SEED SAMPLE COMPANY (Optional - for testing)
-- =====================================================
-- Uncomment if you want a test company

-- INSERT INTO companies (dic, "legalName", "adminEmail", status, "isActive")
-- VALUES (
--   '1234567890',
--   'Test Company s.r.o.',
--   'admin@testcompany.sk',
--   'draft',
--   false
-- );

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check all users with roles
SELECT
  u.email,
  ur.role,
  ur."isActive"
FROM auth.users u
LEFT JOIN "userRoles" ur ON ur."userId" = u.id
ORDER BY ur.role;

-- Check access point providers
-- SELECT name, "baseUrl", "isActive" FROM "accessPointProviders";

-- Check companies
-- SELECT dic, "legalName", "adminEmail", status, "isActive" FROM companies;
