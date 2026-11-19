BEGIN;

DROP TABLE svo.occurrence_triages;
DROP FUNCTION svo.prevent_occurrence_triage_mutation();

COMMIT;
