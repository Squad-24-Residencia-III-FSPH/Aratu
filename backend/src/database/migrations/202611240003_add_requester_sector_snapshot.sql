BEGIN;

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS sector TEXT NULL
  CHECK (sector IS NULL OR btrim(sector) <> '');

ALTER TABLE trip.requests
  ADD COLUMN IF NOT EXISTS requester_snapshot JSONB NULL;

COMMIT;
