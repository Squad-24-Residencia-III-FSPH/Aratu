BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.drivers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  cpf TEXT NOT NULL,
  cnh_number TEXT NOT NULL CHECK (btrim(cnh_number) <> ''),
  cnh_category TEXT NOT NULL
    CHECK (cnh_category IN ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')),
  cnh_expires_at DATE NOT NULL,
  phone TEXT CHECK (phone IS NULL OR btrim(phone) <> ''),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'AWAY')),
  user_id BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_drivers_cpf_format
    CHECK (cpf ~ '^[0-9]{11}$')
);

CREATE UNIQUE INDEX fleet_drivers_cpf_unique
  ON fleet.drivers (cpf);

CREATE UNIQUE INDEX fleet_drivers_user_id_unique
  ON fleet.drivers (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX fleet_drivers_by_status_name
  ON fleet.drivers (status, name, id);

CREATE TABLE fleet.driver_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES fleet.drivers (id) ON DELETE RESTRICT,
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

CREATE INDEX fleet_driver_events_by_driver
  ON fleet.driver_events (driver_id, occurred_at DESC, id DESC);

CREATE FUNCTION fleet.prevent_driver_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fleet.driver_events is append-only';
END;
$$;

CREATE TRIGGER fleet_driver_events_append_only
  BEFORE UPDATE OR DELETE ON fleet.driver_events
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_driver_event_mutation();

COMMIT;
