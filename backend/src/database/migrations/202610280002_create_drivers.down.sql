BEGIN;

DROP TABLE IF EXISTS fleet.driver_events;
DROP FUNCTION IF EXISTS fleet.prevent_driver_event_mutation();
DROP TABLE IF EXISTS fleet.drivers;

COMMIT;
