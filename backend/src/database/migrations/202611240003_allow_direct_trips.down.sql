BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trip.trips WHERE request_id IS NULL) THEN
    RAISE EXCEPTION 'Direct trips exist; preserve them and roll back the application code instead.';
  END IF;
END;
$$;

DROP INDEX trip_trips_creation_key;
ALTER TABLE trip.trips
  DROP CONSTRAINT trip_trips_direct_context_required,
  DROP COLUMN creation_payload,
  DROP COLUMN creation_key,
  DROP COLUMN created_by,
  DROP COLUMN context_snapshot,
  DROP COLUMN service_id,
  ALTER COLUMN request_id SET NOT NULL;

COMMIT;
