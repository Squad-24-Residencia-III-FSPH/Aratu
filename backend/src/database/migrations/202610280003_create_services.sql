BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.services (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  description TEXT CHECK (description IS NULL OR btrim(description) <> ''),
  categories TEXT[] NOT NULL DEFAULT ARRAY['PASSENGER']::TEXT[],
  requires_triage BOOLEAN NOT NULL DEFAULT false,
  requires_weight BOOLEAN NOT NULL DEFAULT false,
  requires_identification BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_services_categories_valid
    CHECK (cardinality(categories) > 0 AND categories <@ ARRAY['PASSENGER', 'BODY', 'OTHER']::TEXT[])
);

CREATE UNIQUE INDEX fleet_services_name_lower_unique
  ON fleet.services (lower(btrim(name)));

CREATE INDEX fleet_services_by_active_name
  ON fleet.services (active, name, id);

CREATE TABLE fleet.vehicle_services (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES fleet.services (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_vehicle_services_pair_unique
    UNIQUE (vehicle_id, service_id)
);

CREATE INDEX fleet_vehicle_services_by_vehicle
  ON fleet.vehicle_services (vehicle_id);

CREATE INDEX fleet_vehicle_services_by_service
  ON fleet.vehicle_services (service_id);

COMMIT;
