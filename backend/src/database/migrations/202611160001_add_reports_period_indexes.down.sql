BEGIN;
DROP INDEX IF EXISTS fleet.fleet_drivers_by_cnh_expires_at;
DROP INDEX IF EXISTS trip.trip_trips_by_scheduled_start;
DROP INDEX IF EXISTS trip.trip_requests_by_requested_date;
DROP INDEX IF EXISTS fleet.fleet_maintenance_orders_by_opened_at;
DROP INDEX IF EXISTS fleet.fleet_fines_by_infraction_at;
DROP INDEX IF EXISTS fleet.fleet_fuelings_by_fueled_at;
COMMIT;
