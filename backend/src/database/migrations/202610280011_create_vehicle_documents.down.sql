BEGIN;

DROP TABLE IF EXISTS fleet.vehicle_document_events;
DROP FUNCTION IF EXISTS fleet.prevent_vehicle_document_event_mutation();
DROP TABLE IF EXISTS fleet.vehicle_documents;

COMMIT;
