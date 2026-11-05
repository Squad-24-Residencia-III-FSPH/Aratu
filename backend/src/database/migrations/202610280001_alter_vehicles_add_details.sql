BEGIN;

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS brand TEXT CHECK (brand IS NULL OR btrim(brand) <> ''),
  ADD COLUMN IF NOT EXISTS model TEXT CHECK (model IS NULL OR btrim(model) <> ''),
  ADD COLUMN IF NOT EXISTS year INTEGER CHECK (year IS NULL OR (year >= 1980 AND year <= 2100)),
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT CHECK (vehicle_type IS NULL OR btrim(vehicle_type) <> ''),
  ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'OWNED'
    CHECK (ownership IN ('OWNED', 'LEASED'));

ALTER TABLE fleet.vehicles
  DROP CONSTRAINT fleet_vehicles_license_plate_format;

ALTER TABLE fleet.vehicles
  ADD CONSTRAINT fleet_vehicles_license_plate_format
    CHECK (upper(license_plate) ~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$');

DROP INDEX IF EXISTS fleet.fleet_vehicles_license_plate_unique;

CREATE UNIQUE INDEX fleet_vehicles_license_plate_unique
  ON fleet.vehicles (upper(license_plate));

COMMIT;
