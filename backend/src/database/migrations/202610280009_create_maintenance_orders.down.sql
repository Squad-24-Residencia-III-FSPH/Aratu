BEGIN;

DROP TABLE IF EXISTS fleet.maintenance_order_events;
DROP FUNCTION IF EXISTS fleet.prevent_maintenance_order_event_mutation();
DROP TABLE IF EXISTS fleet.maintenance_orders;

COMMIT;
