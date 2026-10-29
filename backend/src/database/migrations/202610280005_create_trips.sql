BEGIN;

CREATE SCHEMA IF NOT EXISTS trip;

CREATE TABLE trip.trips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id BIGINT NOT NULL UNIQUE REFERENCES trip.requests (id) ON DELETE RESTRICT,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  driver_id BIGINT NOT NULL REFERENCES fleet.drivers (id) ON DELETE RESTRICT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CONFIRMED', 'CANCELED')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  start_km INTEGER CHECK (start_km IS NULL OR start_km >= 0),
  end_km INTEGER CHECK (end_km IS NULL OR end_km >= 0),
  start_km_photo_url TEXT CHECK (start_km_photo_url IS NULL OR btrim(start_km_photo_url) <> ''),
  end_km_photo_url TEXT CHECK (end_km_photo_url IS NULL OR btrim(end_km_photo_url) <> ''),
  confirmed_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ,
  vehicle_snapshot JSONB,
  driver_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trip_trips_scheduled_period_valid
    CHECK (scheduled_end > scheduled_start),
  CONSTRAINT trip_trips_execution_period_valid
    CHECK (started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at),
  CONSTRAINT trip_trips_odometer_valid
    CHECK (start_km IS NULL OR end_km IS NULL OR end_km >= start_km)
);

CREATE INDEX trip_trips_vehicle_period
  ON trip.trips (vehicle_id, scheduled_start, scheduled_end)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');

CREATE INDEX trip_trips_driver_period
  ON trip.trips (driver_id, scheduled_start, scheduled_end)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');

CREATE UNIQUE INDEX trip_trips_vehicle_in_progress_unique
  ON trip.trips (vehicle_id)
  WHERE status = 'IN_PROGRESS';

CREATE UNIQUE INDEX trip_trips_driver_in_progress_unique
  ON trip.trips (driver_id)
  WHERE status = 'IN_PROGRESS';

CREATE INDEX trip_trips_by_status_scheduled
  ON trip.trips (status, scheduled_start DESC, id DESC);

-- Paradas de viagem (coleta, entrega, destino): cancelar marca status = 'CANCELED', proibido DELETE físico
CREATE TABLE trip.trip_stops (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trip.trips (id) ON DELETE RESTRICT,
  sequence_order INTEGER NOT NULL CHECK (sequence_order > 0),
  stop_type TEXT NOT NULL CHECK (stop_type IN ('PICKUP', 'DELIVERY', 'DESTINATION', 'WAYPOINT')),
  location TEXT NOT NULL CHECK (btrim(location) <> ''),
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  status TEXT NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'COMPLETED', 'CANCELED')),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR btrim(cancellation_reason) <> ''),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trip_trip_stops_cancellation_requires_reason
    CHECK (status <> 'CANCELED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> ''))
);

CREATE INDEX trip_trip_stops_by_trip
  ON trip.trip_stops (trip_id, sequence_order, id);

CREATE FUNCTION trip.prevent_trip_stop_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'trip.trip_stops cannot be physically deleted; mark status as CANCELED';
END;
$$;

CREATE TRIGGER trip_trip_stops_no_delete
  BEFORE DELETE ON trip.trip_stops
  FOR EACH ROW EXECUTE FUNCTION trip.prevent_trip_stop_deletion();

-- Leituras de hodômetro append-only com encadeamento de retificações (supersedes_id) e anulação (is_annulled)
CREATE TABLE trip.odometer_readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  trip_id BIGINT REFERENCES trip.trips (id) ON DELETE RESTRICT,
  reading_type TEXT NOT NULL CHECK (reading_type IN ('START', 'END', 'CHECK')),
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES trip.odometer_readings (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trip_odometer_readings_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX trip_odometer_readings_by_vehicle
  ON trip.odometer_readings (vehicle_id, occurred_at DESC, id DESC);

CREATE INDEX trip_odometer_readings_by_trip
  ON trip.odometer_readings (trip_id, occurred_at DESC, id DESC)
  WHERE trip_id IS NOT NULL;

CREATE INDEX trip_odometer_readings_by_supersedes
  ON trip.odometer_readings (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION trip.prevent_odometer_reading_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'trip.odometer_readings is append-only';
END;
$$;

CREATE TRIGGER trip_odometer_readings_append_only
  BEFORE UPDATE OR DELETE ON trip.odometer_readings
  FOR EACH ROW EXECUTE FUNCTION trip.prevent_odometer_reading_mutation();

-- Trilha imutável de todos os acontecimentos da viagem
CREATE TABLE trip.trip_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trip.trips (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'SCHEDULED',
      'STARTED',
      'FINISHED',
      'CONFIRMED',
      'VEHICLE_CHANGED',
      'DRIVER_CHANGED',
      'DESTINATION_CHANGED',
      'ODOMETER_RECORDED',
      'ODOMETER_RECTIFIED',
      'ODOMETER_ANNULLED',
      'STOP_ADDED',
      'STOP_COMPLETED',
      'STOP_CANCELED',
      'REOPENED',
      'CANCELED'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES trip.trip_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT trip_trip_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX trip_trip_events_by_trip
  ON trip.trip_events (trip_id, occurred_at DESC, id DESC);

CREATE INDEX trip_trip_events_by_supersedes
  ON trip.trip_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION trip.prevent_trip_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'trip.trip_events is append-only';
END;
$$;

CREATE TRIGGER trip_trip_events_append_only
  BEFORE UPDATE OR DELETE ON trip.trip_events
  FOR EACH ROW EXECUTE FUNCTION trip.prevent_trip_event_mutation();

COMMIT;
