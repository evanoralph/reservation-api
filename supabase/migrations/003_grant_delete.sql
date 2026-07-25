-- Patch: allow DELETE for test cleanup and admin operations.
-- Safe to run if 001 was applied before DELETE grants were added.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE items TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reservations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
