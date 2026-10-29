BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.fines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  driver_id BIGINT REFERENCES fleet.drivers (id) ON DELETE RESTRICT,
  trip_id BIGINT REFERENCES trip.trips (id) ON DELETE RESTRICT,
  svo_execution_order_id BIGINT REFERENCES svo.execution_orders (id) ON DELETE RESTRICT,
  infraction_at TIMESTAMPTZ NOT NULL,
  infraction_code TEXT NOT NULL CHECK (btrim(infraction_code) <> ''),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  location TEXT CHECK (location IS NULL OR btrim(location) <> ''),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  due_at DATE,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'CONTESTED', 'CANCELED')),
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR btrim(cancellation_reason) <> ''),
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  created_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  vehicle_snapshot JSONB,
  driver_snapshot JSONB,
  trip_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_fines_cancellation_requires_reason
    CHECK (status <> 'CANCELED' OR (cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> ''))
);

CREATE INDEX fleet_fines_by_vehicle
  ON fleet.fines (vehicle_id, infraction_at DESC, id DESC);

CREATE INDEX fleet_fines_by_driver
  ON fleet.fines (driver_id, infraction_at DESC, id DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX fleet_fines_by_trip
  ON fleet.fines (trip_id)
  WHERE trip_id IS NOT NULL;

CREATE INDEX fleet_fines_by_status_due
  ON fleet.fines (status, due_at ASC, id ASC);

CREATE TABLE fleet.fine_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fine_id BIGINT NOT NULL REFERENCES fleet.fines (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'REGISTERED',
      'DRIVER_IDENTIFIED',
      'DRIVER_CHANGED',
      'CONTESTED',
      'PAID',
      'CANCELED',
      'REOPENED',
      'UPDATED',
      'RECTIFIED',
      'ANNULLED'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES fleet.fine_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_fine_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX fleet_fine_events_by_fine
  ON fleet.fine_events (fine_id, occurred_at DESC, id DESC);

CREATE INDEX fleet_fine_events_by_supersedes
  ON fleet.fine_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION fleet.prevent_fine_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fleet.fine_events is append-only';
END;
$$;

CREATE TRIGGER fleet_fine_events_append_only
  BEFORE UPDATE OR DELETE ON fleet.fine_events
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_fine_event_mutation();

COMMIT;
