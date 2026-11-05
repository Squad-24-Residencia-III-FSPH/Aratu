BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.vehicle_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('CRLV', 'LICENSING', 'IPVA', 'INSURANCE', 'LEASE_CONTRACT', 'OTHER')),
  document_number TEXT CHECK (document_number IS NULL OR btrim(document_number) <> ''),
  issued_at DATE,
  expires_at DATE NOT NULL,
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  supersedes_id BIGINT REFERENCES fleet.vehicle_documents (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  annulment_reason TEXT CHECK (annulment_reason IS NULL OR btrim(annulment_reason) <> ''),
  created_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  vehicle_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_vehicle_documents_dates_valid
    CHECK (issued_at IS NULL OR expires_at >= issued_at),
  CONSTRAINT fleet_vehicle_documents_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CONSTRAINT fleet_vehicle_documents_annulment_requires_reason
    CHECK (is_annulled = false OR (annulment_reason IS NOT NULL AND btrim(annulment_reason) <> ''))
);

CREATE INDEX fleet_vehicle_documents_by_expiration
  ON fleet.vehicle_documents (expires_at ASC, id ASC)
  WHERE is_annulled = false;

CREATE INDEX fleet_vehicle_documents_by_vehicle
  ON fleet.vehicle_documents (vehicle_id, expires_at DESC, id DESC);

CREATE INDEX fleet_vehicle_documents_by_supersedes
  ON fleet.vehicle_documents (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE TABLE fleet.vehicle_document_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_document_id BIGINT NOT NULL REFERENCES fleet.vehicle_documents (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('REGISTERED', 'RENEWED', 'UPDATED', 'RECTIFIED', 'ANNULLED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES fleet.vehicle_document_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_vehicle_document_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX fleet_vehicle_document_events_by_document
  ON fleet.vehicle_document_events (vehicle_document_id, occurred_at DESC, id DESC);

CREATE INDEX fleet_vehicle_document_events_by_supersedes
  ON fleet.vehicle_document_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION fleet.prevent_vehicle_document_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fleet.vehicle_document_events is append-only';
END;
$$;

CREATE TRIGGER fleet_vehicle_document_events_append_only
  BEFORE UPDATE OR DELETE ON fleet.vehicle_document_events
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_vehicle_document_event_mutation();

COMMIT;
