BEGIN;

UPDATE fleet.vehicles
   SET license_plate = upper(license_plate)
 WHERE license_plate <> upper(license_plate);

DROP INDEX IF EXISTS fleet.fleet_vehicles_license_plate_unique;

CREATE UNIQUE INDEX fleet_vehicles_license_plate_unique
  ON fleet.vehicles (license_plate);

ALTER TABLE fleet.vehicles
  DROP CONSTRAINT fleet_vehicles_license_plate_format;

ALTER TABLE fleet.vehicles
  ADD CONSTRAINT fleet_vehicles_license_plate_format
    CHECK (license_plate ~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$');

ALTER TABLE fleet.vehicles
  DROP COLUMN IF EXISTS ownership,
  DROP COLUMN IF EXISTS vehicle_type,
  DROP COLUMN IF EXISTS year,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS brand;

COMMIT;
