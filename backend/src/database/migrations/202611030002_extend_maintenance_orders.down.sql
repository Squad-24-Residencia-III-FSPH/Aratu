BEGIN;

LOCK TABLE fleet.maintenance_orders IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT id FROM fleet.maintenance_orders
    WHERE expected_completion_date IS NOT NULL OR estimate_items IS NOT NULL
       OR actual_items IS NOT NULL OR creation_key IS NOT NULL
  ) OR EXISTS (
    SELECT id FROM fleet.maintenance_order_events
    WHERE after_state ? 'openingRequest' OR after_state ? 'estimateItems'
  ) THEN
    RAISE EXCEPTION 'Rollback recusado para preservar os dados operacionais. Reverta apenas a aplicação.';
  END IF;
END;
$$;

DROP INDEX fleet.fleet_maintenance_orders_creation_key;
DROP INDEX fleet.fleet_maintenance_orders_one_active_block;
ALTER TABLE fleet.maintenance_orders
  DROP COLUMN expected_completion_date,
  DROP COLUMN estimate_items,
  DROP COLUMN actual_items,
  DROP COLUMN creation_key;

COMMIT;
