BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trip.requests WHERE service_id IS NULL)
    OR EXISTS (SELECT 1 FROM trip.trips WHERE service_snapshot IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Rollback recusado para preservar solicitações sem classificação e snapshots de serviço.';
  END IF;
END;
$$;

ALTER TABLE trip.trips
  DROP CONSTRAINT trip_trips_service_snapshot_valid,
  DROP COLUMN service_snapshot;

ALTER TABLE trip.requests
  ALTER COLUMN service_id SET NOT NULL;

COMMIT;
