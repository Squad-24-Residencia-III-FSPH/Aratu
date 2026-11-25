BEGIN;

CREATE TABLE svo.team_shifts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES svo.teams (id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  canceled_at TIMESTAMPTZ,
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR btrim(cancellation_reason) <> ''),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_team_shifts_period_valid CHECK (ends_at > starts_at),
  CONSTRAINT svo_team_shifts_cancellation_requires_reason CHECK (
    (canceled_at IS NULL AND cancellation_reason IS NULL)
    OR (canceled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')
  )
);

CREATE INDEX svo_team_shifts_by_team_period
  ON svo.team_shifts (team_id, starts_at, ends_at, id)
  WHERE canceled_at IS NULL;

ALTER TABLE svo.team_events
  DROP CONSTRAINT IF EXISTS team_events_event_type_check;
ALTER TABLE svo.team_events
  ADD CONSTRAINT team_events_event_type_check CHECK (event_type IN (
    'CREATED', 'UPDATED', 'STATUS_CHANGED', 'MEMBER_ADDED', 'MEMBER_REMOVED',
    'SHIFT_CREATED', 'SHIFT_UPDATED', 'SHIFT_CANCELED', 'RECTIFIED', 'ANNULLED'
  ));

ALTER TABLE svo.occurrences
  ADD COLUMN dispatch_requested_at TIMESTAMPTZ,
  ADD COLUMN dispatch_requested_by BIGINT REFERENCES auth.users (id) ON DELETE RESTRICT,
  ADD COLUMN dispatch_actor_snapshot JSONB,
  ADD COLUMN dispatch_wait_reason TEXT,
  ADD CONSTRAINT svo_occurrences_dispatch_intent_consistent CHECK (
    (dispatch_requested_at IS NULL AND dispatch_requested_by IS NULL AND dispatch_actor_snapshot IS NULL)
    OR (dispatch_requested_at IS NOT NULL AND dispatch_requested_by IS NOT NULL AND dispatch_actor_snapshot IS NOT NULL)
  ),
  ADD CONSTRAINT svo_occurrences_dispatch_wait_reason_valid CHECK (
    dispatch_wait_reason IS NULL OR dispatch_wait_reason IN ('NO_TEAM', 'NO_VEHICLE')
  );

CREATE INDEX svo_occurrences_dispatch_queue
  ON svo.occurrences (dispatch_requested_at, id)
  WHERE status = 'CONFIRMED' AND dispatch_requested_at IS NOT NULL;

ALTER TABLE svo.occurrence_events
  DROP CONSTRAINT IF EXISTS occurrence_events_event_type_check;
ALTER TABLE svo.occurrence_events
  ADD CONSTRAINT occurrence_events_event_type_check CHECK (event_type IN (
    'RECEIVED', 'TRIAGED', 'CONFIRMED', 'UPDATED', 'CANCELED', 'REOPENED',
    'RECTIFIED', 'ANNULLED', 'DISPATCH_REQUESTED', 'DISPATCH_ATTEMPTED',
    'DISPATCHED', 'DISPATCH_WAITING'
  ));

ALTER TABLE svo.execution_orders
  ADD COLUMN team_shift_id BIGINT REFERENCES svo.team_shifts (id) ON DELETE RESTRICT,
  ADD COLUMN allocation_snapshot JSONB;

COMMIT;
