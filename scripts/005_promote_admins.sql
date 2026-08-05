-- ============================================================
-- Promote existing Supabase Auth users to ADMIN console users
-- ============================================================
-- The two users must ALREADY exist in Supabase Authentication
-- (Auth > Users). This script links each auth user to an
-- ADMIN-role shopfloor_users record via the admin_users table.
--
-- >>> EDIT the three columns below for each admin:
--     email        = the exact email in Supabase Authentication
--     display_name = shown in the console
--     user_code    = a unique badge/login code (any unique string)
-- ============================================================

WITH new_admins(email, display_name, user_code) AS (
  VALUES
    ('admin1@example.com', 'Admin One', 'ADMIN1'),
    ('admin2@example.com', 'Admin Two', 'ADMIN2')
),

-- 1. Create (or upgrade) the shopfloor_users ADMIN records
upserted_users AS (
  INSERT INTO shopfloor_users (user_code, display_name, role, is_active)
  SELECT user_code, display_name, 'ADMIN', TRUE
  FROM new_admins
  ON CONFLICT (user_code) DO UPDATE
    SET role = 'ADMIN',
        is_active = TRUE,
        display_name = EXCLUDED.display_name
  RETURNING id, user_code
)

-- 2. Link each Supabase Auth UID to its shopfloor ADMIN record
INSERT INTO admin_users (auth_uid, user_id)
SELECT au.id, su.id
FROM new_admins na
JOIN auth.users au        ON lower(au.email) = lower(na.email)
JOIN upserted_users su    ON su.user_code = na.user_code
ON CONFLICT (auth_uid) DO UPDATE
  SET user_id = EXCLUDED.user_id;

-- 3. Verify — should return one row per admin
SELECT au.email, s.display_name, s.role, s.is_active
FROM admin_users a
JOIN auth.users au        ON au.id = a.auth_uid
JOIN shopfloor_users s    ON s.id = a.user_id
WHERE s.role = 'ADMIN';
