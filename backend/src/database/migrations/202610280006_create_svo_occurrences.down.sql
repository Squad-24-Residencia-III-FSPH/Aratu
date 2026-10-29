BEGIN;

DROP TABLE IF EXISTS svo.occurrence_events;
DROP FUNCTION IF EXISTS svo.prevent_occurrence_event_mutation();
DROP TABLE IF EXISTS svo.occurrences;

COMMIT;
