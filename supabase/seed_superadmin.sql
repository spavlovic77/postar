-- Run this AFTER creating the user in Supabase Dashboard:
--   Authentication > Users > Add User
--   Email: stanislav.pavlovic1@gmail.com
--   Password: .Speedo2217
--   Check "Auto Confirm User"

INSERT INTO "userRoles" ("userId", role, "isActive")
SELECT id, 'superAdmin', true
FROM auth.users
WHERE email = 'stanislav.pavlovic1@gmail.com'
ON CONFLICT ("userId") DO UPDATE SET role = 'superAdmin', "isActive" = true;
