BEGIN;
LOCK TABLE fleet.fuelings IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT supersedes_id FROM fleet.fuelings WHERE supersedes_id IS NOT NULL
    GROUP BY supersedes_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Há retificações ramificadas. Revise o histórico antes de migrar.';
  END IF;
END;
$$;
ALTER TABLE fleet.fuelings
  ADD COLUMN request_key UUID,
  ADD COLUMN request_payload JSONB,
  ADD CONSTRAINT fleet_fuelings_request_pair CHECK (
    (request_key IS NULL AND request_payload IS NULL) OR
    (request_key IS NOT NULL AND request_payload IS NOT NULL AND jsonb_typeof(request_payload) = 'object')
  );
CREATE UNIQUE INDEX fleet_fuelings_request_key ON fleet.fuelings (created_by, request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX fleet_fuelings_one_successor ON fleet.fuelings (supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE FUNCTION fleet.prevent_fueling_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Abastecimentos são imutáveis. Registre uma retificação.';
END;
$$;
CREATE TRIGGER fleet_fuelings_append_only BEFORE UPDATE OR DELETE ON fleet.fuelings
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_fueling_mutation();
COMMIT;
