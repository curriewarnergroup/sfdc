-- ============================================================
-- Unmanned Runs — Migration 003
-- ============================================================

-- 1. Add SUPERVISOR to user role enum (if using CHECK constraint)
-- The shopfloor_users.role column uses a TEXT CHECK — just inserting 'SUPERVISOR' will work
-- once we update the check constraint. If it's a native enum, add value:
ALTER TABLE shopfloor_users DROP CONSTRAINT IF EXISTS shopfloor_users_role_check;
ALTER TABLE shopfloor_users ADD CONSTRAINT shopfloor_users_role_check
  CHECK (role IN ('OPERATOR', 'SETTER', 'QC', 'ADMIN', 'SUPERVISOR'));

-- 2. Add UNMANNED to session_type enum
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('SETUP', 'RUN', 'UNMANNED'));

-- 3. Add authorised_by column to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS
  authorised_by UUID REFERENCES shopfloor_users(id);

-- 4. Index for fast unmanned lookups
CREATE INDEX IF NOT EXISTS idx_sessions_authorised_by ON sessions(authorised_by);
CREATE INDEX IF NOT EXISTS idx_sessions_session_type  ON sessions(session_type);
