BEGIN;

DROP INDEX IF EXISTS aud_by_registered_at;
DROP INDEX IF EXISTS aud_by_user;
DROP INDEX IF EXISTS aud_by_table;
DROP TABLE IF EXISTS aud_audit;

COMMIT;
