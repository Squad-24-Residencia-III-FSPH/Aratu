BEGIN;

CREATE TABLE svo.occurrence_triages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurrence_id BIGINT NOT NULL REFERENCES svo.occurrences (id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  supersedes_id BIGINT,
  deceased_name TEXT,
  estimated_age TEXT,
  responsible_physician TEXT,
  crm TEXT,
  preliminary_cause_of_death TEXT,
  available_documents TEXT[],
  referral TEXT,
  triage_notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  CONSTRAINT svo_occurrence_triages_revision_unique UNIQUE (occurrence_id, revision),
  CONSTRAINT svo_occurrence_triages_identity_unique UNIQUE (occurrence_id, id),
  CONSTRAINT svo_occurrence_triages_supersedes_same_occurrence
    FOREIGN KEY (occurrence_id, supersedes_id)
    REFERENCES svo.occurrence_triages (occurrence_id, id) ON DELETE RESTRICT,
  CONSTRAINT svo_occurrence_triages_superseded_once UNIQUE (supersedes_id),
  CONSTRAINT svo_occurrence_triages_no_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CONSTRAINT svo_occurrence_triages_revision_parent CHECK (
    (revision = 1 AND supersedes_id IS NULL) OR (revision > 1 AND supersedes_id IS NOT NULL)
  )
);

CREATE INDEX svo_occurrence_triages_latest
  ON svo.occurrence_triages (occurrence_id, revision DESC, id DESC);

CREATE FUNCTION svo.prevent_occurrence_triage_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'svo.occurrence_triages is append-only';
END;
$$;

CREATE TRIGGER svo_occurrence_triages_append_only
  BEFORE UPDATE OR DELETE ON svo.occurrence_triages
  FOR EACH ROW EXECUTE FUNCTION svo.prevent_occurrence_triage_mutation();

COMMIT;
