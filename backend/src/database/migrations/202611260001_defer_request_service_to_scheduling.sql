BEGIN;

ALTER TABLE trip.requests
  ALTER COLUMN service_id DROP NOT NULL;

ALTER TABLE trip.trips
  ADD COLUMN service_snapshot JSONB,
  ADD CONSTRAINT trip_trips_service_snapshot_valid CHECK (
    service_snapshot IS NULL OR (
      service_id IS NOT NULL
      AND jsonb_typeof(service_snapshot) = 'object'
      AND service_snapshot ?& ARRAY['id', 'name', 'categories', 'revision']
    )
  );

COMMIT;
