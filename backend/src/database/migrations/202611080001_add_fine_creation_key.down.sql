BEGIN;
LOCK TABLE fleet.fines IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT id FROM fleet.fines WHERE creation_key IS NOT NULL)
     OR EXISTS (SELECT id FROM fleet.fine_events
                WHERE event_type = 'REGISTERED'
                  AND after_state ? 'registrationRequest') THEN
    RAISE EXCEPTION 'Rollback recusado para preservar o histórico de reenvio. Reverta apenas a aplicação.';
  END IF;
END;
$$;
DROP INDEX fleet.fleet_fines_creation_key;
ALTER TABLE fleet.fines DROP COLUMN creation_key;
COMMIT;
