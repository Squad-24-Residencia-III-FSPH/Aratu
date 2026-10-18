BEGIN;

CREATE TABLE aud_audit (
  aud_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usr_id BIGINT REFERENCES usr_user (usr_id) ON DELETE RESTRICT,
  aud_table TEXT NOT NULL CHECK (btrim(aud_table) <> ''),
  aud_record_id TEXT CHECK (aud_record_id IS NULL OR btrim(aud_record_id) <> ''),
  aud_operation TEXT NOT NULL CHECK (btrim(aud_operation) <> ''),
  aud_before JSONB,
  aud_after JSONB,
  aud_actor_snapshot JSONB,
  aud_reason TEXT CHECK (aud_reason IS NULL OR btrim(aud_reason) <> ''),
  aud_registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX aud_by_table ON aud_audit (aud_table, aud_record_id);
CREATE INDEX aud_by_user ON aud_audit (usr_id);
CREATE INDEX aud_by_registered_at ON aud_audit (aud_registered_at DESC, aud_id DESC);

COMMIT;
