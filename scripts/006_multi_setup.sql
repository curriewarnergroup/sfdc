-- ============================================================
-- Multi-Setup Machines & Multi-Job Users — Migration 006
-- Run this in the Supabase SQL Editor before deploying the updated code.
-- ============================================================

-- 1. Flag a machine as supporting multiple concurrent setups / jobs.
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS is_multi_setup BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Denormalised per-session copy of the machine's multi flag.
--    Stamped at session-insert time so the DB-level occupancy safety net can
--    exempt multi-setup machines while still protecting normal machines.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS allow_multi BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill any existing live/finished sessions from their machine flag.
UPDATE sessions s
  SET allow_multi = m.is_multi_setup
  FROM machines m
  WHERE s.machine_id = m.id
    AND s.allow_multi IS DISTINCT FROM m.is_multi_setup;

-- 3. Machine occupancy: only enforce "one active/paused session per machine"
--    on machines that are NOT multi-setup. Multi-setup machines are exempt.
DROP INDEX IF EXISTS idx_sessions_one_active_per_machine;
CREATE UNIQUE INDEX idx_sessions_one_active_per_machine
  ON sessions(machine_id)
  WHERE status IN ('ACTIVE', 'PAUSED') AND allow_multi = FALSE;

-- 4. Allow setters / operators to be signed onto multiple jobs at once
--    (everywhere, no cap). Drop the single-active-session-per-user rule.
DROP INDEX IF EXISTS idx_sessions_one_active_per_user;

-- 5. Tell PostgREST (the REST API) to reload its schema cache immediately, so
--    the new columns are visible without waiting or restarting. This clears the
--    "Could not find the 'is_multi_setup' column ... in the schema cache" error.
NOTIFY pgrst, 'reload schema';
