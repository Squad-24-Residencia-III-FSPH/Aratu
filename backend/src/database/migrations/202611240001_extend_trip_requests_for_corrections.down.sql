BEGIN;

LOCK TABLE trip.requests, trip.request_events, trip.trips IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT id FROM trip.requests
    WHERE status = 'RETURNED' OR special_requirements IS NOT NULL OR notes IS NOT NULL
  ) OR EXISTS (
    SELECT id FROM trip.request_events WHERE event_type IN ('RETURNED', 'RESUBMITTED')
  ) OR EXISTS (
    SELECT id FROM trip.trips
    WHERE request_snapshot IS NOT NULL OR special_requirements_acknowledged OR evidence_description IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Rollback recusado para preservar correções e evidências de viagem. Reverta apenas a aplicação.';
  END IF;
END;
$$;

ALTER TABLE trip.trips
  DROP CONSTRAINT trip_special_requirements_evidence_consistency,
  DROP COLUMN request_snapshot,
  DROP COLUMN special_requirements_acknowledged,
  DROP COLUMN evidence_description;

ALTER TABLE trip.request_events
  DROP CONSTRAINT request_events_event_type_check,
  ADD CONSTRAINT request_events_event_type_check
    CHECK (event_type IN ('CREATED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'UPDATED', 'CANCELED', 'RECTIFIED', 'ANNULLED'));

ALTER TABLE trip.requests
  DROP CONSTRAINT requests_status_check,
  DROP COLUMN special_requirements,
  DROP COLUMN notes,
  ADD CONSTRAINT requests_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED'));

COMMIT;
