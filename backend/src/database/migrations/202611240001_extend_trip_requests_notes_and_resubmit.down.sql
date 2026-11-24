BEGIN;

ALTER TABLE trip.request_events
  DROP CONSTRAINT IF EXISTS request_events_event_type_check;

ALTER TABLE trip.request_events
  ADD CONSTRAINT request_events_event_type_check
  CHECK (event_type IN ('CREATED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'UPDATED', 'CANCELED', 'RECTIFIED', 'ANNULLED'));

ALTER TABLE trip.requests
  DROP COLUMN IF EXISTS notes;

COMMIT;
