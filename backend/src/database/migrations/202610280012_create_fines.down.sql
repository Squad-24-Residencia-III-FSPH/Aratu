BEGIN;

DROP TABLE IF EXISTS fleet.fine_events;
DROP FUNCTION IF EXISTS fleet.prevent_fine_event_mutation();
DROP TABLE IF EXISTS fleet.fines;

COMMIT;
