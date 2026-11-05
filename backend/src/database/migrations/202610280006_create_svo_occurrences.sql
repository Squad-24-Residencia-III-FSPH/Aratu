BEGIN;

CREATE SCHEMA IF NOT EXISTS svo;

CREATE TABLE svo.occurrences (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendant_id BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  requester_name TEXT NOT NULL CHECK (btrim(requester_name) <> ''),
  requester_phone TEXT NOT NULL CHECK (btrim(requester_phone) <> ''),
  requester_type TEXT NOT NULL
    CHECK (requester_type IN ('FAMILY', 'HOSPITAL', 'UBS', 'UPA', 'PUBLIC_AGENCY', 'OTHER')),
  location TEXT NOT NULL CHECK (btrim(location) <> ''),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  triaged_at TIMESTAMPTZ,
  triaged_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR btrim(cancellation_reason) <> ''),
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  attendant_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_occurrences_cancellation_requires_reason
    CHECK (status <> 'CANCELED' OR (cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')),
  CONSTRAINT svo_occurrences_triage_consistency
    CHECK ((status = 'PENDING' AND triaged_at IS NULL AND triaged_by IS NULL) OR status <> 'PENDING')
);

CREATE INDEX svo_occurrences_by_status_received
  ON svo.occurrences (status, received_at DESC, id DESC);

CREATE INDEX svo_occurrences_by_attendant
  ON svo.occurrences (attendant_id, received_at DESC, id DESC);

CREATE TABLE svo.occurrence_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurrence_id BIGINT NOT NULL REFERENCES svo.occurrences (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('RECEIVED', 'TRIAGED', 'CONFIRMED', 'UPDATED', 'CANCELED', 'REOPENED', 'RECTIFIED', 'ANNULLED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES svo.occurrence_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_occurrence_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX svo_occurrence_events_by_occurrence
  ON svo.occurrence_events (occurrence_id, occurred_at DESC, id DESC);

CREATE INDEX svo_occurrence_events_by_supersedes
  ON svo.occurrence_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION svo.prevent_occurrence_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'svo.occurrence_events is append-only';
END;
$$;

CREATE TRIGGER svo_occurrence_events_append_only
  BEFORE UPDATE OR DELETE ON svo.occurrence_events
  FOR EACH ROW EXECUTE FUNCTION svo.prevent_occurrence_event_mutation();

COMMIT;
