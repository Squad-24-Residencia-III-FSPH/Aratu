BEGIN;

CREATE INDEX IF NOT EXISTS trip_trips_by_finished_at
  ON trip.trips (finished_at, vehicle_id)
  WHERE status IN ('FINISHED', 'CONFIRMED');

CREATE INDEX IF NOT EXISTS fleet_maintenance_orders_by_closed_at
  ON fleet.maintenance_orders (closed_at, vehicle_id)
  WHERE status = 'DONE';

CREATE INDEX IF NOT EXISTS svo_execution_orders_by_opened_at
  ON svo.execution_orders (opened_at, id);

COMMIT;
