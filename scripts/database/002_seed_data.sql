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
-- These are the SAPI SK access points for document submission

INSERT INTO "accessPointProviders" (id, name, url, description, "isActive")
VALUES 
  (gen_random_uuid(), 'SAPI SK - Production', 'https://www.financnasprava.sk', 'Slovak Financial Administration - Production', true),
  (gen_random_uuid(), 'SAPI SK - Test', 'https://testsapi.financnasprava.sk', 'Slovak Financial Administration - Test Environment', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- STEP 3: SEED SAMPLE COMPANY (Optional - for testing)
-- =====================================================
-- Uncomment if you want a test company

-- INSERT INTO companies (id, name, "dic", "icDph", "isActive")
-- VALUES (
--   gen_random_uuid(),
--   'Test Company s.r.o.',
--   '1234567890',
--   'SK1234567890',
--   true
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
SELECT name, url, "isActive" FROM "accessPointProviders";

-- Check companies
SELECT name, dic, "icDph", "isActive" FROM companies;
