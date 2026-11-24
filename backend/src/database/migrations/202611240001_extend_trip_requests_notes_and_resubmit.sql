BEGIN;

ALTER TABLE trip.requests
  ADD COLUMN IF NOT EXISTS notes TEXT NULL
  CHECK (notes IS NULL OR btrim(notes) <> '');

ALTER TABLE trip.request_events
  DROP CONSTRAINT IF EXISTS request_events_event_type_check;

ALTER TABLE trip.request_events
  ADD CONSTRAINT request_events_event_type_check
  CHECK (event_type IN ('CREATED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'UPDATED', 'CANCELED', 'RECTIFIED', 'ANNULLED', 'RESUBMITTED'));

COMMIT;
