BEGIN;

-- Alinha fleet.vehicle_events e fleet.driver_events (FROTA-157) com as 5 perguntas + retificação/anulação
ALTER TABLE fleet.vehicle_events
  ADD COLUMN IF NOT EXISTS evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  ADD COLUMN IF NOT EXISTS supersedes_id BIGINT REFERENCES fleet.vehicle_events (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_annulled BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT fleet_vehicle_events_no_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id);

ALTER TABLE fleet.driver_events
  ADD COLUMN IF NOT EXISTS evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  ADD COLUMN IF NOT EXISTS supersedes_id BIGINT REFERENCES fleet.driver_events (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_annulled BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT fleet_driver_events_no_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id);

CREATE SCHEMA IF NOT EXISTS trip;

CREATE TABLE trip.requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES fleet.services (id) ON DELETE RESTRICT,
  requested_date DATE NOT NULL,
  requested_time TIME NOT NULL,
  origin TEXT NOT NULL CHECK (btrim(origin) <> ''),
  destination TEXT NOT NULL CHECK (btrim(destination) <> ''),
  purpose TEXT NOT NULL CHECK (btrim(purpose) <> ''),
  passengers INTEGER NOT NULL DEFAULT 1 CHECK (passengers > 0),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED')),
  decided_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT CHECK (decision_reason IS NULL OR btrim(decision_reason) <> ''),
  requester_snapshot JSONB,
  service_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trip_requests_rejection_requires_reason
    CHECK (status <> 'REJECTED' OR (decision_reason IS NOT NULL AND btrim(decision_reason) <> '')),
  CONSTRAINT trip_requests_decision_consistency
    CHECK ((status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL) OR status <> 'PENDING')
);

CREATE INDEX trip_requests_by_requester
  ON trip.requests (requester_id, created_at DESC, id DESC);

CREATE INDEX trip_requests_by_status_date
  ON trip.requests (status, requested_date, requested_time, id);

CREATE INDEX trip_requests_by_service
  ON trip.requests (service_id);

CREATE TABLE trip.request_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES trip.requests (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('CREATED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'UPDATED', 'CANCELED', 'RECTIFIED', 'ANNULLED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES trip.request_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trip_request_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX trip_request_events_by_request
  ON trip.request_events (request_id, occurred_at DESC, id DESC);

CREATE INDEX trip_request_events_by_supersedes
  ON trip.request_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION trip.prevent_request_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'trip.request_events is append-only';
END;
$$;

CREATE TRIGGER trip_request_events_append_only
  BEFORE UPDATE OR DELETE ON trip.request_events
  FOR EACH ROW EXECUTE FUNCTION trip.prevent_request_event_mutation();

COMMIT;
