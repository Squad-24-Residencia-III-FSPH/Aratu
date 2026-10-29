BEGIN;

DROP INDEX IF EXISTS trip.trip_odometer_readings_by_fueling;
DROP INDEX IF EXISTS trip.trip_odometer_readings_by_maintenance;

DELETE FROM trip.odometer_readings
 WHERE reading_type IN ('FUELING', 'MAINTENANCE');

ALTER TABLE trip.odometer_readings
  DROP CONSTRAINT IF EXISTS odometer_readings_reading_type_check;

ALTER TABLE trip.odometer_readings
  ADD CONSTRAINT odometer_readings_reading_type_check
    CHECK (reading_type IN ('START', 'END', 'CHECK'));

ALTER TABLE trip.odometer_readings
  DROP COLUMN IF EXISTS fueling_id,
  DROP COLUMN IF EXISTS maintenance_order_id;

DROP TABLE IF EXISTS fleet.fueling_events;
DROP FUNCTION IF EXISTS fleet.prevent_fueling_event_mutation();
DROP TABLE IF EXISTS fleet.fuelings;

COMMIT;
