BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

DROP TABLE IF EXISTS aud_audit CASCADE;
DROP TABLE IF EXISTS audit.log CASCADE;

CREATE TABLE audit.logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  table_name TEXT NOT NULL CHECK (btrim(table_name) <> ''),
  record_id TEXT CHECK (record_id IS NULL OR btrim(record_id) <> ''),
  operation TEXT NOT NULL CHECK (btrim(operation) <> ''),
  before JSONB,
  after JSONB,
  actor_snapshot JSONB,
  reason TEXT CHECK (reason IS NULL OR btrim(reason) <> ''),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX audit_logs_by_table ON audit.logs (table_name, record_id);
CREATE INDEX audit_logs_by_user ON audit.logs (user_id);
CREATE INDEX audit_logs_by_registered_at ON audit.logs (registered_at DESC, id DESC);

COMMIT;
