BEGIN;

ALTER TABLE trip.requests
  ADD COLUMN special_requirements TEXT CHECK (
    special_requirements IS NULL OR btrim(special_requirements) <> ''
  ),
  ADD COLUMN notes TEXT CHECK (notes IS NULL OR btrim(notes) <> '');

ALTER TABLE trip.requests
  DROP CONSTRAINT IF EXISTS requests_status_check,
  ADD CONSTRAINT requests_status_check
    CHECK (status IN ('PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED'));

ALTER TABLE trip.request_events
  DROP CONSTRAINT IF EXISTS request_events_event_type_check,
  ADD CONSTRAINT request_events_event_type_check
    CHECK (event_type IN (
      'CREATED', 'APPROVED', 'REJECTED', 'RETURNED', 'RESUBMITTED', 'SCHEDULED',
      'UPDATED', 'CANCELED', 'RECTIFIED', 'ANNULLED'
    ));

ALTER TABLE trip.trips
  ADD COLUMN request_snapshot JSONB,
  ADD COLUMN special_requirements_acknowledged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  ADD CONSTRAINT trip_special_requirements_evidence_consistency
    CHECK (
      (special_requirements_acknowledged = true AND evidence_description IS NOT NULL)
      OR (special_requirements_acknowledged = false AND evidence_description IS NULL)
    );

COMMIT;
