-- ============================================================
-- 007: Per-job standards for the Job Times & Efficiency report
-- ------------------------------------------------------------
--   cycle_seconds x quantity  -> expected RUN time   (run efficiency)
--   setup_target_hours        -> expected SETUP time (setup efficiency)
--
--   run efficiency %   = ((cycle_seconds * quantity) / 60) / actual_run_mins   * 100
--   setup efficiency % = (setup_target_hours * 60)         / actual_setup_mins * 100
--
-- Both standards are optional and independent: a job can have a setup
-- target with no cycle time, or the other way round.
-- One row per MO number. Entered from the reporting UI.
--
-- Safe to re-run. If an earlier version of this file was already applied,
-- the ALTER statements below bring the table up to date without data loss.
-- ============================================================

CREATE TABLE IF NOT EXISTS mo_cycle_times (
  mo_number           TEXT PRIMARY KEY,
  cycle_seconds       NUMERIC,
  quantity            INTEGER,
  setup_target_hours  NUMERIC,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES shopfloor_users(id) ON DELETE SET NULL
);

-- Upgrade path from the earlier version of this migration.
ALTER TABLE mo_cycle_times ADD COLUMN IF NOT EXISTS setup_target_hours NUMERIC;
ALTER TABLE mo_cycle_times ALTER COLUMN cycle_seconds DROP NOT NULL;
ALTER TABLE mo_cycle_times ALTER COLUMN quantity      DROP NOT NULL;

-- Values must be positive when present, and a row must hold at least one standard.
ALTER TABLE mo_cycle_times DROP CONSTRAINT IF EXISTS mo_cycle_times_cycle_seconds_check;
ALTER TABLE mo_cycle_times DROP CONSTRAINT IF EXISTS mo_cycle_times_quantity_check;

ALTER TABLE mo_cycle_times DROP CONSTRAINT IF EXISTS mo_cycle_times_positive;
ALTER TABLE mo_cycle_times ADD  CONSTRAINT mo_cycle_times_positive CHECK (
  (cycle_seconds      IS NULL OR cycle_seconds      > 0) AND
  (quantity           IS NULL OR quantity           > 0) AND
  (setup_target_hours IS NULL OR setup_target_hours > 0)
);

-- A cycle-time standard only makes sense with a quantity attached.
ALTER TABLE mo_cycle_times DROP CONSTRAINT IF EXISTS mo_cycle_times_cycle_pair;
ALTER TABLE mo_cycle_times ADD  CONSTRAINT mo_cycle_times_cycle_pair CHECK (
  (cycle_seconds IS NULL) = (quantity IS NULL)
);

COMMENT ON TABLE  mo_cycle_times                    IS 'Standard run + setup times per MO, used for efficiency reporting';
COMMENT ON COLUMN mo_cycle_times.cycle_seconds      IS 'Standard seconds to produce one part';
COMMENT ON COLUMN mo_cycle_times.quantity           IS 'Quantity the cycle-time standard applies to';
COMMENT ON COLUMN mo_cycle_times.setup_target_hours IS 'Target setup time for the job, in hours';

-- Reporting reads/writes this via the service role only.
ALTER TABLE mo_cycle_times ENABLE ROW LEVEL SECURITY;
