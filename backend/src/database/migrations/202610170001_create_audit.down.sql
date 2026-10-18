BEGIN;

DROP INDEX IF EXISTS audit.audit_logs_by_registered_at;
DROP INDEX IF EXISTS audit.audit_logs_by_user;
DROP INDEX IF EXISTS audit.audit_logs_by_table;
DROP TABLE IF EXISTS audit.logs;

COMMIT;
