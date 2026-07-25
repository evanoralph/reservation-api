-- Patch for projects that already ran 001_initial_schema.sql
-- Run this in the Supabase SQL Editor if verify-migration fails with:
--   "new row violates row-level security policy for table items"

ALTER TABLE items DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservations DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
