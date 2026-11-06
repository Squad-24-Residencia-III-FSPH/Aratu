BEGIN;

LOCK TABLE fleet.maintenance_orders IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT vehicle_id FROM fleet.maintenance_orders
    WHERE blocks_vehicle AND status IN ('OPEN', 'IN_PROGRESS')
    GROUP BY vehicle_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Regularize as ordens impeditivas ativas duplicadas por veículo antes da migração.';
  END IF;
END;
$$;

ALTER TABLE fleet.maintenance_orders
  ADD COLUMN expected_completion_date date,
  ADD COLUMN estimate_items jsonb CHECK (jsonb_typeof(estimate_items) = 'array'),
  ADD COLUMN actual_items jsonb CHECK (jsonb_typeof(actual_items) = 'array'),
  ADD COLUMN creation_key uuid;

CREATE UNIQUE INDEX fleet_maintenance_orders_creation_key
  ON fleet.maintenance_orders (created_by, creation_key)
  WHERE creation_key IS NOT NULL;
CREATE UNIQUE INDEX fleet_maintenance_orders_one_active_block
  ON fleet.maintenance_orders (vehicle_id)
  WHERE blocks_vehicle AND status IN ('OPEN', 'IN_PROGRESS');

COMMIT;
