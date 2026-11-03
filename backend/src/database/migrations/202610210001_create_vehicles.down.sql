BEGIN;

DROP TABLE IF EXISTS fleet.vehicle_events;
DROP FUNCTION IF EXISTS fleet.prevent_vehicle_event_mutation();
DROP TABLE IF EXISTS fleet.vehicles;

COMMIT;
