BEGIN;

DROP INDEX IF EXISTS svo.svo_execution_orders_by_opened_at;
DROP INDEX IF EXISTS fleet.fleet_maintenance_orders_by_closed_at;
DROP INDEX IF EXISTS trip.trip_trips_by_finished_at;

COMMIT;
