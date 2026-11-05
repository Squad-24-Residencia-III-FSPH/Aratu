BEGIN;

DROP TABLE IF EXISTS trip.trip_events;
DROP FUNCTION IF EXISTS trip.prevent_trip_event_mutation();
DROP TABLE IF EXISTS trip.odometer_readings;
DROP FUNCTION IF EXISTS trip.prevent_odometer_reading_mutation();
DROP TABLE IF EXISTS trip.trip_stops;
DROP FUNCTION IF EXISTS trip.prevent_trip_stop_deletion();
DROP TABLE IF EXISTS trip.trips;

COMMIT;
