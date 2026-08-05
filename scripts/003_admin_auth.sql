-- ============================================================
-- Admin Console — Supabase Auth integration
-- Maps Supabase Auth UIDs to ADMIN-role shopfloor users
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
  auth_uid   UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES shopfloor_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Drop policies before recreating (idempotent)
DROP POLICY IF EXISTS "auth_admin_users_select"         ON shopfloor_users;
DROP POLICY IF EXISTS "auth_admin_shopfloor_users_insert" ON shopfloor_users;
DROP POLICY IF EXISTS "auth_admin_shopfloor_users_update" ON shopfloor_users;
DROP POLICY IF EXISTS "auth_admin_machines_insert"      ON machines;
DROP POLICY IF EXISTS "auth_admin_machines_update"      ON machines;
DROP POLICY IF EXISTS "auth_admin_shift_patterns_insert" ON shift_patterns;
DROP POLICY IF EXISTS "auth_admin_shift_patterns_update" ON shift_patterns;
DROP POLICY IF EXISTS "auth_admin_pause_reasons_insert" ON pause_reasons;
DROP POLICY IF EXISTS "auth_admin_pause_reasons_update" ON pause_reasons;

-- Authenticated users can read all master-data tables
CREATE POLICY "auth_admin_users_select"
  ON shopfloor_users FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "auth_admin_shopfloor_users_insert"
  ON shopfloor_users FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "auth_admin_shopfloor_users_update"
  ON shopfloor_users FOR UPDATE TO authenticated USING (TRUE);

CREATE POLICY "auth_admin_machines_insert"
  ON machines FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "auth_admin_machines_update"
  ON machines FOR UPDATE TO authenticated USING (TRUE);

CREATE POLICY "auth_admin_shift_patterns_insert"
  ON shift_patterns FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "auth_admin_shift_patterns_update"
  ON shift_patterns FOR UPDATE TO authenticated USING (TRUE);

CREATE POLICY "auth_admin_pause_reasons_insert"
  ON pause_reasons FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "auth_admin_pause_reasons_update"
  ON pause_reasons FOR UPDATE TO authenticated USING (TRUE);
