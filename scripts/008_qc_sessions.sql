-- ============================================================
-- 008: QC session tokens
-- ------------------------------------------------------------
-- Replaces the raw qc_user_id cookie (client-settable, trusted identity) with
-- an opaque, hashed session token — the same pattern already used for kiosk
-- devices in device_sessions. Only the service role (which bypasses RLS) may
-- read or write this table; there are no client-facing policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES shopfloor_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '12 hours',
  is_valid   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_qc_sessions_token_hash ON qc_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_qc_sessions_user_id ON qc_sessions(user_id);

ALTER TABLE qc_sessions ENABLE ROW LEVEL SECURITY;
-- No policies defined: only the service role client (which bypasses RLS)
-- ever touches this table, mirroring device_sessions.

COMMENT ON TABLE qc_sessions IS 'Hashed QC console session tokens, mirrors the device_sessions pattern';
