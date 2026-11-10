BEGIN;

DROP INDEX IF EXISTS fleet_vehicle_services_by_active_service;

ALTER TABLE fleet.vehicle_services
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS is_active;

COMMIT;
