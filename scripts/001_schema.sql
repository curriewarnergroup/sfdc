-- ============================================================
-- Shopfloor Time-Capture System — Supabase Schema
-- ============================================================

-- Enable pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('OPERATOR', 'SETTER', 'QC', 'ADMIN');
CREATE TYPE session_type AS ENUM ('SETUP', 'RUN');
CREATE TYPE session_status AS ENUM ('ACTIVE', 'PAUSED', 'FINISHED', 'AUTO_CLOSED');
CREATE TYPE qc_code_type AS ENUM ('FIRST_OFF', 'LAST_OFF');
CREATE TYPE qc_result AS ENUM ('PASS', 'FAIL');
CREATE TYPE event_type AS ENUM (
  'SESSION_START',
  'SESSION_PAUSE',
  'SESSION_RESUME',
  'SESSION_FINISH',
  'SESSION_AUTO_CLOSE',
  'QC_CODE_ISSUED',
  'QC_CODE_REDEEMED',
  'QC_CODE_REDEEMED_FAILED',
  'BREAK_AUTO_DEDUCTED',
  'DEVICE_LOGIN',
  'DEVICE_LOGOUT'
);

-- ============================================================
-- 2. DEVICES (shopfloor tablets — NOT Supabase auth users)
-- ============================================================

CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_name  TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- bcrypt hash stored server-side
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device sessions (cookie-based, server-managed)
CREATE TABLE device_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,       -- sha256(token) stored server-side
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_valid   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_device_sessions_token ON device_sessions(token_hash) WHERE is_valid = TRUE;

-- ============================================================
-- 3. SHOPFLOOR USERS (scanned badge users, NOT Supabase auth)
-- ============================================================

CREATE TABLE shopfloor_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code    TEXT NOT NULL UNIQUE,    -- badge scan value
  display_name TEXT NOT NULL,
  role         user_role NOT NULL,
  shift_id     UUID,                   -- FK added below after shift_patterns table
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. SHIFT PATTERNS
-- ============================================================

CREATE TABLE shift_patterns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  start_time     TIME NOT NULL,          -- e.g. '06:00'
  end_time       TIME NOT NULL,          -- e.g. '14:00'
  break_start    TIME,                   -- optional break window start
  break_end      TIME,                   -- optional break window end
  break_minutes  INT NOT NULL DEFAULT 0, -- deductible break duration
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill FK on shopfloor_users
ALTER TABLE shopfloor_users
  ADD CONSTRAINT fk_user_shift
  FOREIGN KEY (shift_id) REFERENCES shift_patterns(id) ON DELETE SET NULL;

-- ============================================================
-- 5. MACHINES
-- ============================================================

CREATE TABLE machines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code TEXT NOT NULL UNIQUE,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. PAUSE REASONS (admin-managed lookup)
-- ============================================================

CREATE TABLE pause_reasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. SESSIONS
-- ============================================================

CREATE TABLE sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type           session_type NOT NULL,
  status                 session_status NOT NULL DEFAULT 'ACTIVE',
  mo_number              TEXT NOT NULL,
  machine_id             UUID NOT NULL REFERENCES machines(id),
  user_id                UUID NOT NULL REFERENCES shopfloor_users(id),
  device_id              UUID NOT NULL REFERENCES devices(id),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at               TIMESTAMPTZ,
  -- QC gating
  first_off_approved     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Break deduction (no fake pause events)
  break_deducted_minutes INT NOT NULL DEFAULT 0,
  break_auto_deducted    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Flags
  auto_closed            BOOLEAN NOT NULL DEFAULT FALSE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent two concurrent active/paused sessions on the same machine
CREATE UNIQUE INDEX idx_sessions_one_active_per_machine
  ON sessions(machine_id)
  WHERE status IN ('ACTIVE', 'PAUSED');

-- Prevent a user from having two concurrent active/paused sessions
CREATE UNIQUE INDEX idx_sessions_one_active_per_user
  ON sessions(user_id)
  WHERE status IN ('ACTIVE', 'PAUSED');

-- Fast lookup by MO + machine
CREATE INDEX idx_sessions_mo_machine ON sessions(mo_number, machine_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ============================================================
-- 8. SESSION EVENTS (append-only audit log)
-- ============================================================

CREATE TABLE session_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
  event_type      event_type NOT NULL,
  actor_user_id   UUID REFERENCES shopfloor_users(id),
  device_id       UUID REFERENCES devices(id),
  pause_reason_id UUID REFERENCES pause_reasons(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_events_session ON session_events(session_id);
CREATE INDEX idx_session_events_type ON session_events(event_type);
CREATE INDEX idx_session_events_occurred ON session_events(occurred_at);

-- ============================================================
-- 9. QC CODES
-- ============================================================

CREATE TABLE qc_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash    TEXT NOT NULL UNIQUE,      -- sha256(plain_code) server-side
  code_type    qc_code_type NOT NULL,
  mo_number    TEXT NOT NULL,
  machine_id   UUID NOT NULL REFERENCES machines(id),
  issued_by    UUID NOT NULL REFERENCES shopfloor_users(id),  -- QC user
  result       qc_result NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  redeemed     BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at  TIMESTAMPTZ,
  redeemed_by  UUID REFERENCES shopfloor_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one valid unredeemed FIRST_OFF code per MO+machine at a time
CREATE UNIQUE INDEX idx_qc_codes_active_first_off
  ON qc_codes(mo_number, machine_id, code_type)
  WHERE redeemed = FALSE AND code_type = 'FIRST_OFF';

CREATE INDEX idx_qc_codes_mo_machine ON qc_codes(mo_number, machine_id);

-- ============================================================
-- 10. AUDIT LOG (system-level events, device login/logout, etc.)
-- ============================================================

CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    event_type NOT NULL,
  actor_user_id UUID REFERENCES shopfloor_users(id),
  device_id     UUID REFERENCES devices(id),
  metadata      JSONB NOT NULL DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_occurred ON audit_log(occurred_at DESC);

-- ============================================================
-- 11. SEED DATA — pause reasons, a default shift, sample machine
-- ============================================================

INSERT INTO pause_reasons (label) VALUES
  ('Waiting for material'),
  ('Machine breakdown'),
  ('Tooling change'),
  ('Quality hold'),
  ('Break'),
  ('Other');

INSERT INTO shift_patterns (name, start_time, end_time, break_start, break_end, break_minutes) VALUES
  ('Day Shift',   '06:00', '14:00', '10:00', '10:30', 30),
  ('Late Shift',  '14:00', '22:00', '18:00', '18:30', 30),
  ('Night Shift', '22:00', '06:00', '02:00', '02:30', 30);

INSERT INTO machines (machine_code, description) VALUES
  ('MC-001', 'CNC Lathe 1'),
  ('MC-002', 'CNC Lathe 2'),
  ('MC-003', 'Milling Centre 1');

-- ============================================================
-- 12. RLS — enable on all tables
-- ============================================================

ALTER TABLE devices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopfloor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_patterns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pause_reasons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- All data access from Next.js server actions uses the SERVICE ROLE KEY
-- (never exposed to client), so no anon policies are needed for data tables.
-- Supabase Auth is used only for QC/ADMIN console users; their RLS uses auth.uid().

-- QC/ADMIN users (authenticated via Supabase Auth) can read lookup tables
CREATE POLICY "auth_read_machines" ON machines FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read_pause_reasons" ON pause_reasons FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read_shift_patterns" ON shift_patterns FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read_shopfloor_users" ON shopfloor_users FOR SELECT TO authenticated USING (TRUE);

-- QC users can read/write QC codes
CREATE POLICY "auth_qc_codes_select" ON qc_codes FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_qc_codes_insert" ON qc_codes FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_qc_codes_update" ON qc_codes FOR UPDATE TO authenticated USING (TRUE);

-- Auth users can read sessions and events (for admin/QC consoles)
CREATE POLICY "auth_sessions_select" ON sessions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_sessions_update" ON sessions FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY "auth_session_events_select" ON session_events FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_session_events_insert" ON session_events FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_audit_log_select" ON audit_log FOR SELECT TO authenticated USING (TRUE);

-- Service role bypasses RLS entirely (used by server actions for kiosk ops)
