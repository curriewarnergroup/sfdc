-- Add quantity columns to sessions for ERP data display
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS qty_to_make   integer,
  ADD COLUMN IF NOT EXISTS qty_made      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_scrapped  integer DEFAULT 0;

COMMENT ON COLUMN sessions.qty_to_make  IS 'Target quantity from ERP / job card';
COMMENT ON COLUMN sessions.qty_made     IS 'Quantity produced so far (from ERP or manual update)';
COMMENT ON COLUMN sessions.qty_scrapped IS 'Quantity scrapped (from ERP or manual update)';
