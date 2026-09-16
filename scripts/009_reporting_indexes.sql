-- ============================================================
-- 009: Reporting indexes
-- ------------------------------------------------------------
-- Supports the date-ranged, paginated queries in getJobTimesReport (and the
-- other reporting.ts queries that filter/order sessions by started_at and
-- fetch session_events per session in batches). Run this in the Supabase
-- SQL editor.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sessions_started_at
  ON sessions (started_at);

CREATE INDEX IF NOT EXISTS idx_sessions_type_started_at
  ON sessions (session_type, started_at);

CREATE INDEX IF NOT EXISTS idx_session_events_session_occurred
  ON session_events (session_id, occurred_at);
