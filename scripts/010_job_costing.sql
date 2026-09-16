-- ============================================================
-- Job Costing (quote vs actual) — Migration 010
-- ============================================================
-- Adds Excel-imported quote standards, a live quote-vs-actual calculation
-- engine (computed on request in application code), and frozen history
-- snapshots for completed MOs. All tables are service-role only: RLS is
-- enabled with no policies, so only server actions (using the service
-- client) can read or write them.

-- ============================================================
-- 1. JOB QUOTE IMPORTS (one row per upload)
-- ============================================================

CREATE TABLE job_quote_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name     TEXT NOT NULL,
  imported_by   UUID REFERENCES shopfloor_users(id),
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rows_total    INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated  INTEGER NOT NULL DEFAULT 0,
  rows_unchanged INTEGER NOT NULL DEFAULT 0,
  rows_failed   INTEGER NOT NULL DEFAULT 0,
  errors        JSONB NOT NULL DEFAULT '[]'
);

-- ============================================================
-- 2. JOB QUOTES (one row per MO — the quote standards)
-- ============================================================

CREATE TABLE job_quotes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mo_number               TEXT NOT NULL UNIQUE,
  part_no                 TEXT NOT NULL,
  total_order_qty         INTEGER NOT NULL CHECK (total_order_qty > 0),
  qty_made                INTEGER CHECK (qty_made IS NULL OR qty_made >= 0),
  qty_scrapped            INTEGER CHECK (qty_scrapped IS NULL OR qty_scrapped >= 0),
  cycle_time_secs         NUMERIC NOT NULL CHECK (cycle_time_secs > 0),
  setup_time_secs         NUMERIC NOT NULL CHECK (setup_time_secs >= 0),
  run_labour_rate         NUMERIC NOT NULL CHECK (run_labour_rate >= 0),
  run_overhead_rate       NUMERIC NOT NULL CHECK (run_overhead_rate >= 0),
  setup_labour_rate       NUMERIC NOT NULL CHECK (setup_labour_rate >= 0),
  setup_overhead_rate     NUMERIC NOT NULL CHECK (setup_overhead_rate >= 0),
  sales_price_per_part    NUMERIC NOT NULL CHECK (sales_price_per_part >= 0),
  material_cost_per_part  NUMERIC CHECK (material_cost_per_part IS NULL OR material_cost_per_part >= 0),
  completed_at            TIMESTAMPTZ,
  completed_by            UUID REFERENCES shopfloor_users(id),
  first_imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_import_batch_id    UUID REFERENCES job_quote_imports(id)
);

CREATE INDEX idx_job_quotes_part_no ON job_quotes(part_no);
CREATE INDEX idx_job_quotes_completed_at ON job_quotes(completed_at);

-- ============================================================
-- 3. JOB COST HISTORY (frozen snapshot per completed MO)
-- ============================================================

CREATE TABLE job_cost_history (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mo_number               TEXT NOT NULL UNIQUE,
  part_no                 TEXT NOT NULL,
  completed_at            TIMESTAMPTZ NOT NULL,
  machine_codes           TEXT[],
  total_order_qty         INTEGER,
  qty_made                INTEGER,
  qty_scrapped            INTEGER,
  quoted_setup_secs       NUMERIC,
  actual_setup_secs       NUMERIC,
  quoted_cycle_secs       NUMERIC,
  actual_cycle_secs       NUMERIC,
  expected_labour_hours   NUMERIC,
  actual_labour_hours     NUMERIC,
  revenue                 NUMERIC,
  material_cost           NUMERIC,
  expected_cost           NUMERIC,
  actual_cost             NUMERIC,
  expected_profit         NUMERIC,
  actual_profit           NUMERIC,
  actual_margin_pct       NUMERIC,
  expected_margin_pct     NUMERIC,
  scrap_pct               NUMERIC,
  material_included       BOOLEAN NOT NULL DEFAULT TRUE,
  quote_snapshot          JSONB NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_cost_history_part_no ON job_cost_history(part_no);

-- ============================================================
-- 4. Row Level Security — service role only, no policies
-- ============================================================

ALTER TABLE job_quote_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_quotes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cost_history  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. import_job_quotes(batch jsonb, rows jsonb) — atomic import
-- ------------------------------------------------------------
-- Inserts the import log row and upserts every NEW/UPDATE row on
-- mo_number in a single transaction, so a failed import never leaves a
-- partial write behind. `batch` carries the job_quote_imports fields;
-- `rows` is a jsonb array of job_quotes rows to upsert (already validated
-- and normalised by the calling server action).
-- ============================================================

CREATE OR REPLACE FUNCTION import_job_quotes(batch JSONB, rows JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_id UUID;
  row_item JSONB;
BEGIN
  INSERT INTO public.job_quote_imports (
    file_name, imported_by, rows_total, rows_inserted, rows_updated,
    rows_unchanged, rows_failed, errors
  )
  VALUES (
    batch->>'file_name',
    (batch->>'imported_by')::UUID,
    COALESCE((batch->>'rows_total')::INTEGER, 0),
    COALESCE((batch->>'rows_inserted')::INTEGER, 0),
    COALESCE((batch->>'rows_updated')::INTEGER, 0),
    COALESCE((batch->>'rows_unchanged')::INTEGER, 0),
    COALESCE((batch->>'rows_failed')::INTEGER, 0),
    COALESCE(batch->'errors', '[]'::JSONB)
  )
  RETURNING id INTO batch_id;

  FOR row_item IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO public.job_quotes (
      mo_number, part_no, total_order_qty, qty_made, qty_scrapped,
      cycle_time_secs, setup_time_secs, run_labour_rate, run_overhead_rate,
      setup_labour_rate, setup_overhead_rate, sales_price_per_part,
      material_cost_per_part, updated_at, last_import_batch_id
    )
    VALUES (
      row_item->>'mo_number',
      row_item->>'part_no',
      (row_item->>'total_order_qty')::INTEGER,
      (row_item->>'qty_made')::INTEGER,
      (row_item->>'qty_scrapped')::INTEGER,
      (row_item->>'cycle_time_secs')::NUMERIC,
      (row_item->>'setup_time_secs')::NUMERIC,
      (row_item->>'run_labour_rate')::NUMERIC,
      (row_item->>'run_overhead_rate')::NUMERIC,
      (row_item->>'setup_labour_rate')::NUMERIC,
      (row_item->>'setup_overhead_rate')::NUMERIC,
      (row_item->>'sales_price_per_part')::NUMERIC,
      (row_item->>'material_cost_per_part')::NUMERIC,
      NOW(),
      batch_id
    )
    ON CONFLICT (mo_number) DO UPDATE SET
      part_no = EXCLUDED.part_no,
      total_order_qty = EXCLUDED.total_order_qty,
      qty_made = EXCLUDED.qty_made,
      qty_scrapped = EXCLUDED.qty_scrapped,
      cycle_time_secs = EXCLUDED.cycle_time_secs,
      setup_time_secs = EXCLUDED.setup_time_secs,
      run_labour_rate = EXCLUDED.run_labour_rate,
      run_overhead_rate = EXCLUDED.run_overhead_rate,
      setup_labour_rate = EXCLUDED.setup_labour_rate,
      setup_overhead_rate = EXCLUDED.setup_overhead_rate,
      sales_price_per_part = EXCLUDED.sales_price_per_part,
      material_cost_per_part = EXCLUDED.material_cost_per_part,
      updated_at = NOW(),
      last_import_batch_id = batch_id;
  END LOOP;

  RETURN batch_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
