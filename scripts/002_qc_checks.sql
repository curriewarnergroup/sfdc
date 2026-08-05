-- ============================================================
-- QC Checks System — Migration 002
-- ============================================================

-- New event types for in-process QC checks
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'QC_CHECK_SUBMITTED';

-- ============================================================
-- 1. CHECK TEMPLATES — the reusable library of check types
-- ============================================================

CREATE TABLE check_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  input_type      TEXT NOT NULL CHECK (input_type IN ('PASS_FAIL', 'NUMERIC', 'TEXT')),
  target_value    NUMERIC,          -- for NUMERIC checks: nominal value
  tolerance_plus  NUMERIC,          -- upper tolerance (e.g. +0.05)
  tolerance_minus NUMERIC,          -- lower tolerance (e.g. -0.05)
  unit            TEXT,             -- e.g. 'mm', 'kg', 'N·m'
  product_id      TEXT,             -- links to product / part number
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_check_templates_product ON check_templates(product_id);

-- ============================================================
-- 2. MO CHECK ASSIGNMENTS — which checks apply to which MO
-- ============================================================

CREATE TABLE mo_check_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mo_number           TEXT NOT NULL,
  product_id          TEXT,             -- denormalised for quick lookup
  check_template_id   UUID NOT NULL REFERENCES check_templates(id) ON DELETE CASCADE,
  order_index         INT NOT NULL DEFAULT 0,
  required            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mo_number, check_template_id)
);

CREATE INDEX idx_mo_check_assignments_mo ON mo_check_assignments(mo_number);
CREATE INDEX idx_mo_check_assignments_product ON mo_check_assignments(product_id);

-- ============================================================
-- 3. CHECK RESULTS — operator responses submitted at the kiosk
-- ============================================================

CREATE TABLE check_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mo_number           TEXT NOT NULL,
  product_id          TEXT,
  machine_id          UUID REFERENCES machines(id),
  session_id          UUID REFERENCES sessions(id) ON DELETE SET NULL,
  check_template_id   UUID NOT NULL REFERENCES check_templates(id),
  result              TEXT CHECK (result IN ('PASS', 'FAIL')),
  numeric_value       NUMERIC,          -- for NUMERIC input_type
  text_value          TEXT,             -- for TEXT input_type
  checked_by          UUID REFERENCES shopfloor_users(id),
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT
);

CREATE INDEX idx_check_results_mo ON check_results(mo_number);
CREATE INDEX idx_check_results_session ON check_results(session_id);
CREATE INDEX idx_check_results_template ON check_results(check_template_id);
CREATE INDEX idx_check_results_product ON check_results(product_id);
CREATE INDEX idx_check_results_machine ON check_results(machine_id);

-- ============================================================
-- 4. RLS — enable on new tables (service role bypasses)
-- ============================================================

ALTER TABLE check_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mo_check_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_results         ENABLE ROW LEVEL SECURITY;

-- Authenticated admin/QC users can read and write
CREATE POLICY "auth_check_templates_all"      ON check_templates     FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_mo_check_assignments_all" ON mo_check_assignments FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_check_results_all"        ON check_results        FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
