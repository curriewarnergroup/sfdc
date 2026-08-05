-- Migration: Add machine_id to devices table
-- Run this in Supabase SQL Editor before deploying the updated code

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS machine_id UUID
  REFERENCES machines(id) ON DELETE SET NULL;

-- Add qty_made and qty_to_make columns to sessions if not already present
-- (these should already exist from schema v1, but just in case)
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qty_made INT;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qty_to_make INT;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qty_scrapped INT;
