BEGIN;
LOCK TABLE fleet.fuelings IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT id FROM fleet.fuelings WHERE request_key IS NOT NULL OR request_payload IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback recusado para preservar histórico. Reverta apenas a aplicação.';
  END IF;
END;
$$;
DROP TRIGGER fleet_fuelings_append_only ON fleet.fuelings;
DROP FUNCTION fleet.prevent_fueling_mutation();
DROP INDEX fleet.fleet_fuelings_one_successor;
DROP INDEX fleet.fleet_fuelings_request_key;
ALTER TABLE fleet.fuelings DROP CONSTRAINT fleet_fuelings_request_pair, DROP COLUMN request_key, DROP COLUMN request_payload;
COMMIT;
