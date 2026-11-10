BEGIN;

ALTER TABLE fleet.vehicle_services
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE INDEX fleet_vehicle_services_by_active_service
  ON fleet.vehicle_services (service_id, vehicle_id)
  WHERE is_active;

COMMIT;
