BEGIN;

CREATE SCHEMA IF NOT EXISTS fleet;

CREATE TABLE fleet.maintenance_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  type TEXT NOT NULL
    CHECK (type IN ('PREVENTIVE', 'CORRECTIVE')),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  blocks_vehicle BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED')),
  odometer_km INTEGER CHECK (odometer_km IS NULL OR odometer_km >= 0),
  cost NUMERIC(12, 2) CHECK (cost IS NULL OR cost >= 0),
  workshop TEXT CHECK (workshop IS NULL OR btrim(workshop) <> ''),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  closed_at TIMESTAMPTZ,
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR btrim(cancellation_reason) <> ''),
  notes TEXT CHECK (notes IS NULL OR btrim(notes) <> ''),
  created_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  closed_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  vehicle_snapshot JSONB,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_maintenance_orders_period_valid
    CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CONSTRAINT fleet_maintenance_orders_cancellation_requires_reason
    CHECK (status <> 'CANCELED' OR (cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> ''))
);

CREATE INDEX fleet_maintenance_orders_by_vehicle
  ON fleet.maintenance_orders (vehicle_id, opened_at DESC, id DESC);

CREATE INDEX fleet_maintenance_orders_by_status_opened
  ON fleet.maintenance_orders (status, opened_at DESC, id DESC);

CREATE TABLE fleet.maintenance_order_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  maintenance_order_id BIGINT NOT NULL REFERENCES fleet.maintenance_orders (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('OPENED', 'STARTED', 'UPDATED', 'CLOSED', 'REOPENED', 'CANCELED', 'RECTIFIED', 'ANNULLED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES fleet.maintenance_order_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fleet_maintenance_order_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX fleet_maintenance_order_events_by_order
  ON fleet.maintenance_order_events (maintenance_order_id, occurred_at DESC, id DESC);

CREATE INDEX fleet_maintenance_order_events_by_supersedes
  ON fleet.maintenance_order_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION fleet.prevent_maintenance_order_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fleet.maintenance_order_events is append-only';
END;
$$;

CREATE TRIGGER fleet_maintenance_order_events_append_only
  BEFORE UPDATE OR DELETE ON fleet.maintenance_order_events
  FOR EACH ROW EXECUTE FUNCTION fleet.prevent_maintenance_order_event_mutation();

COMMIT;
