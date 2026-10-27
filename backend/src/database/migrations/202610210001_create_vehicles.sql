BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.vehicles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_plate TEXT NOT NULL,
  categories TEXT[] NOT NULL,
  seats INTEGER NOT NULL CHECK (seats >= 0),
  body_limit INTEGER NOT NULL CHECK (body_limit >= 0),
  weight_limit NUMERIC(10, 2) CHECK (weight_limit IS NULL OR weight_limit >= 0),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('ADMINISTRATIVE', 'SVO')),
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'IN_MAINTENANCE', 'INACTIVE')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_vehicles_license_plate_format
    CHECK (license_plate ~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$'),
  CONSTRAINT fleet_vehicles_categories_valid
    CHECK (cardinality(categories) > 0 AND categories <@ ARRAY['PASSENGER', 'BODY', 'OTHER']::TEXT[])
);

CREATE UNIQUE INDEX fleet_vehicles_license_plate_unique
  ON fleet.vehicles (license_plate);
CREATE INDEX fleet_vehicles_by_status_operation
  ON fleet.vehicles (status, operation_type, id);
CREATE INDEX fleet_vehicles_by_categories
  ON fleet.vehicles USING GIN (categories);

CREATE TABLE fleet.vehicle_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'STATUS_CHANGED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX fleet_vehicle_events_by_vehicle
  ON fleet.vehicle_events (vehicle_id, occurred_at DESC, id DESC);

CREATE FUNCTION fleet.prevent_vehicle_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fleet.vehicle_events is append-only';
END;
$$;

CREATE TRIGGER fleet_vehicle_events_append_only
  BEFORE UPDATE OR DELETE ON fleet.vehicle_events
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_vehicle_event_mutation();

COMMIT;
