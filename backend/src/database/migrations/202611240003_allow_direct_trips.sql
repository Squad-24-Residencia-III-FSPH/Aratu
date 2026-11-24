BEGIN;

ALTER TABLE trip.trips
  ALTER COLUMN request_id DROP NOT NULL,
  ADD COLUMN service_id BIGINT REFERENCES fleet.services (id) ON DELETE RESTRICT,
  ADD COLUMN context_snapshot JSONB,
  ADD COLUMN created_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  ADD COLUMN creation_key UUID,
  ADD COLUMN creation_payload JSONB,
  ADD CONSTRAINT trip_trips_direct_context_required CHECK (
    request_id IS NOT NULL OR (
      service_id IS NOT NULL
      AND context_snapshot IS NOT NULL
      AND created_by IS NOT NULL
      AND creation_key IS NOT NULL
      AND creation_payload IS NOT NULL
      AND jsonb_typeof(context_snapshot) = 'object'
      AND jsonb_typeof(creation_payload) = 'object'
      AND context_snapshot ?& ARRAY[
        'serviceId', 'serviceName', 'origin', 'destination',
        'purpose', 'passengers', 'specialRequirements', 'notes'
      ]
    )
  );

CREATE UNIQUE INDEX trip_trips_creation_key
  ON trip.trips (created_by, creation_key)
  WHERE creation_key IS NOT NULL;

COMMIT;
