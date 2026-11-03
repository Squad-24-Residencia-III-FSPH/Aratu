BEGIN;

DROP TABLE IF EXISTS svo.team_events;
DROP FUNCTION IF EXISTS svo.prevent_team_event_mutation();
DROP TABLE IF EXISTS svo.team_members;
DROP TABLE IF EXISTS svo.teams;

COMMIT;
