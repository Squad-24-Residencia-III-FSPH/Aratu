BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.fuelings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  driver_id BIGINT REFERENCES fleet.drivers (id) ON DELETE RESTRICT,
  fueled_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fuel_type TEXT NOT NULL
    CHECK (fuel_type IN ('GASOLINE', 'ETHANOL', 'DIESEL', 'DIESEL_S10', 'GNV', 'FLEX', 'OTHER')),
  liters NUMERIC(10, 3) NOT NULL CHECK (liters > 0),
  total_value NUMERIC(12, 2) NOT NULL CHECK (total_value > 0),
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  station TEXT CHECK (station IS NULL OR btrim(station) <> ''),
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  reported_by TEXT NOT NULL DEFAULT 'Registro Operacional' CHECK (btrim(reported_by) <> ''),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB,
  reason TEXT CHECK (reason IS NULL OR btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES fleet.fuelings (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  annulment_reason TEXT CHECK (annulment_reason IS NULL OR btrim(annulment_reason) <> ''),
  vehicle_snapshot JSONB,
  driver_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_fuelings_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CONSTRAINT fleet_fuelings_annulment_requires_reason
    CHECK (is_annulled = false OR (annulment_reason IS NOT NULL AND btrim(annulment_reason) <> ''))
);

CREATE INDEX fleet_fuelings_by_vehicle
  ON fleet.fuelings (vehicle_id, fueled_at DESC, id DESC);

CREATE INDEX fleet_fuelings_by_driver
  ON fleet.fuelings (driver_id, fueled_at DESC, id DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX fleet_fuelings_by_supersedes
  ON fleet.fuelings (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE TABLE fleet.fueling_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fueling_id BIGINT NOT NULL REFERENCES fleet.fuelings (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('RECORDED', 'UPDATED', 'RECTIFIED', 'ANNULLED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES fleet.fueling_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_fueling_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX fleet_fueling_events_by_fueling
  ON fleet.fueling_events (fueling_id, occurred_at DESC, id DESC);

CREATE INDEX fleet_fueling_events_by_supersedes
  ON fleet.fueling_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION fleet.prevent_fueling_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fleet.fueling_events is append-only';
END;
$$;

CREATE TRIGGER fleet_fueling_events_append_only
  BEFORE UPDATE OR DELETE ON fleet.fueling_events
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_fueling_event_mutation();

-- Integra leituras de hodômetro do veículo também às manutenções e abastecimentos
ALTER TABLE trip.odometer_readings
  ADD COLUMN IF NOT EXISTS maintenance_order_id BIGINT REFERENCES fleet.maintenance_orders (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fueling_id BIGINT REFERENCES fleet.fuelings (id) ON DELETE RESTRICT;

ALTER TABLE trip.odometer_readings
  DROP CONSTRAINT IF EXISTS odometer_readings_reading_type_check;

ALTER TABLE trip.odometer_readings
  ADD CONSTRAINT odometer_readings_reading_type_check
    CHECK (reading_type IN ('START', 'END', 'CHECK', 'FUELING', 'MAINTENANCE'));

CREATE INDEX IF NOT EXISTS trip_odometer_readings_by_maintenance
  ON trip.odometer_readings (maintenance_order_id, occurred_at DESC, id DESC)
  WHERE maintenance_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS trip_odometer_readings_by_fueling
  ON trip.odometer_readings (fueling_id, occurred_at DESC, id DESC)
  WHERE fueling_id IS NOT NULL;

COMMIT;
