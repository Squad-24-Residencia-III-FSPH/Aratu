BEGIN;

CREATE SCHEMA IF NOT EXISTS svo;

CREATE TABLE svo.execution_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurrence_id BIGINT NOT NULL UNIQUE REFERENCES svo.occurrences (id) ON DELETE RESTRICT,
  team_id BIGINT NOT NULL REFERENCES svo.teams (id) ON DELETE RESTRICT,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  driver_id BIGINT REFERENCES fleet.drivers (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS', 'COMPLETED', 'NOT_PERFORMED', 'CANCELED')),
  result TEXT CHECK (result IS NULL OR result IN ('COMPLETED', 'NOT_PERFORMED')),
  failure_reason TEXT CHECK (failure_reason IS NULL OR btrim(failure_reason) <> ''),
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  departed_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  start_km INTEGER CHECK (start_km IS NULL OR start_km >= 0),
  end_km INTEGER CHECK (end_km IS NULL OR end_km >= 0),
  start_km_photo_url TEXT CHECK (start_km_photo_url IS NULL OR btrim(start_km_photo_url) <> ''),
  end_km_photo_url TEXT CHECK (end_km_photo_url IS NULL OR btrim(end_km_photo_url) <> ''),
  created_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  closed_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  occurrence_snapshot JSONB,
  team_snapshot JSONB,
  vehicle_snapshot JSONB,
  driver_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_execution_orders_not_performed_requires_reason
    CHECK (
      (status <> 'NOT_PERFORMED' AND (result IS NULL OR result <> 'NOT_PERFORMED'))
      OR (failure_reason IS NOT NULL AND btrim(failure_reason) <> '')
    ),
  CONSTRAINT svo_execution_orders_period_valid
    CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CONSTRAINT svo_execution_orders_odometer_valid
    CHECK (start_km IS NULL OR end_km IS NULL OR end_km >= start_km)
);

CREATE INDEX svo_execution_orders_by_status
  ON svo.execution_orders (status, opened_at DESC, id DESC);

CREATE INDEX svo_execution_orders_by_team
  ON svo.execution_orders (team_id, status, opened_at DESC, id DESC);

CREATE INDEX svo_execution_orders_by_vehicle
  ON svo.execution_orders (vehicle_id, status, opened_at DESC, id DESC);

CREATE INDEX svo_execution_orders_by_driver
  ON svo.execution_orders (driver_id, opened_at DESC, id DESC)
  WHERE driver_id IS NOT NULL;

CREATE TABLE svo.execution_order_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  execution_order_id BIGINT NOT NULL REFERENCES svo.execution_orders (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'OPENED',
      'DEPARTED',
      'ARRIVED',
      'IN_PROGRESS',
      'COLLECTED',
      'COMPLETED',
      'NOT_PERFORMED',
      'VEHICLE_CHANGED',
      'TEAM_CHANGED',
      'DRIVER_CHANGED',
      'DESTINATION_CHANGED',
      'ODOMETER_RECORDED',
      'ODOMETER_RECTIFIED',
      'ODOMETER_ANNULLED',
      'REOPENED',
      'CANCELED',
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
  supersedes_id BIGINT REFERENCES svo.execution_order_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_execution_order_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX svo_execution_order_events_by_order
  ON svo.execution_order_events (execution_order_id, occurred_at DESC, id DESC);

CREATE INDEX svo_execution_order_events_by_supersedes
  ON svo.execution_order_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION svo.prevent_execution_order_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'svo.execution_order_events is append-only';
END;
$$;

CREATE TRIGGER svo_execution_order_events_append_only
  BEFORE UPDATE OR DELETE ON svo.execution_order_events
  FOR EACH ROW EXECUTE FUNCTION svo.prevent_execution_order_event_mutation();

-- Integra leituras de hodômetro do veículo também às ordens de execução SVO
ALTER TABLE trip.odometer_readings
  ADD COLUMN IF NOT EXISTS svo_execution_order_id BIGINT REFERENCES svo.execution_orders (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS trip_odometer_readings_by_svo_order
  ON trip.odometer_readings (svo_execution_order_id, occurred_at DESC, id DESC)
  WHERE svo_execution_order_id IS NOT NULL;

COMMIT;
