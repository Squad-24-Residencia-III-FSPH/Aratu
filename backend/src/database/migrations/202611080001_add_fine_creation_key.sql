BEGIN;
ALTER TABLE fleet.fines ADD COLUMN creation_key UUID;
CREATE UNIQUE INDEX fleet_fines_creation_key
  ON fleet.fines (created_by, creation_key)
  WHERE creation_key IS NOT NULL;
COMMIT;
