-- ============================================================
-- 007: Standard cycle times per job (MO)
-- ------------------------------------------------------------
-- Stores the engineering standard for a job so the Job Times
-- report can compare actual run time against expected time.
--   expected minutes = (cycle_seconds * quantity) / 60
--   efficiency %     = expected / actual * 100
-- One row per MO number. Entered from the reporting UI.
-- ============================================================

CREATE TABLE IF NOT EXISTS mo_cycle_times (
  mo_number      TEXT PRIMARY KEY,
  cycle_seconds  NUMERIC NOT NULL CHECK (cycle_seconds > 0),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES shopfloor_users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  mo_cycle_times                IS 'Standard cycle time + quantity per MO, used for run-time efficiency';
COMMENT ON COLUMN mo_cycle_times.cycle_seconds  IS 'Standard seconds to produce one part';
COMMENT ON COLUMN mo_cycle_times.quantity       IS 'Quantity the standard applies to';

-- Reporting reads/writes this via the service role only.
ALTER TABLE mo_cycle_times ENABLE ROW LEVEL SECURITY;
