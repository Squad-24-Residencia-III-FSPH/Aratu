BEGIN;

DROP INDEX IF EXISTS trip.trip_odometer_readings_by_svo_order;

ALTER TABLE trip.odometer_readings
  DROP COLUMN IF EXISTS svo_execution_order_id;

DROP TABLE IF EXISTS svo.execution_order_events;
DROP FUNCTION IF EXISTS svo.prevent_execution_order_event_mutation();
DROP TABLE IF EXISTS svo.execution_orders;

COMMIT;
