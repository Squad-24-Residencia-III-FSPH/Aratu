BEGIN;

DROP TABLE IF EXISTS trip.request_events;
DROP FUNCTION IF EXISTS trip.prevent_request_event_mutation();
DROP TABLE IF EXISTS trip.requests;

ALTER TABLE fleet.driver_events
  DROP CONSTRAINT IF EXISTS fleet_driver_events_no_self_supersede,
  DROP COLUMN IF EXISTS is_annulled,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS attachment_url,
  DROP COLUMN IF EXISTS evidence_description;

ALTER TABLE fleet.vehicle_events
  DROP CONSTRAINT IF EXISTS fleet_vehicle_events_no_self_supersede,
  DROP COLUMN IF EXISTS is_annulled,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS attachment_url,
  DROP COLUMN IF EXISTS evidence_description;

COMMIT;
