-- Seed Super Admin User
-- Run this in the Supabase SQL Editor with service role permissions

-- IMPORTANT: Change these values before running!
-- Email: admin@example.com
-- Password: Admin123!@#

-- Step 1: Create the auth user using Supabase's auth.users table
-- Note: For production, create the user via Supabase Dashboard or Auth API instead

-- First, check if the user already exists
DO $$
DECLARE
  new_user_id UUID;
  existing_user_id UUID;
BEGIN
  -- Check for existing user with this email
  SELECT id INTO existing_user_id 
  FROM auth.users 
  WHERE email = 'admin@example.com';
  
  IF existing_user_id IS NOT NULL THEN
    -- User exists, just ensure they have superAdmin role
    INSERT INTO "userRoles" ("userId", role)
    VALUES (existing_user_id, 'superAdmin')
    ON CONFLICT ("userId") DO UPDATE SET role = 'superAdmin';
    
    RAISE NOTICE 'User already exists. Updated role to superAdmin. User ID: %', existing_user_id;
  ELSE
    -- Create new user using Supabase's internal function
    new_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@example.com',
      crypt('Admin123!@#', gen_salt('bf')), -- Password: Admin123!@#
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Super Admin"}',
      'authenticated',
      'authenticated',
      now(),
      now(),
      '',
      ''
    );
    
    -- Create identity for the user
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', 'admin@example.com'),
      'email',
      new_user_id::text,
      now(),
      now(),
      now()
    );
    
    -- Assign superAdmin role
    INSERT INTO "userRoles" ("userId", role)
    VALUES (new_user_id, 'superAdmin');
    
    RAISE NOTICE 'Super Admin created successfully! User ID: %', new_user_id;
  END IF;
END $$;

-- Verify the user was created
SELECT 
  u.id,
  u.email,
  ur.role,
  u.created_at
FROM auth.users u
JOIN "userRoles" ur ON ur."userId" = u.id
WHERE u.email = 'admin@example.com';
