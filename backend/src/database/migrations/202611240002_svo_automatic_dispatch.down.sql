BEGIN;

LOCK TABLE svo.team_shifts, svo.team_events, svo.occurrences, svo.occurrence_events, svo.execution_orders
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT id FROM svo.team_shifts)
    OR EXISTS (SELECT id FROM svo.team_events WHERE event_type IN ('SHIFT_CREATED', 'SHIFT_UPDATED', 'SHIFT_CANCELED'))
    OR EXISTS (SELECT id FROM svo.occurrences WHERE dispatch_requested_at IS NOT NULL
      OR dispatch_requested_by IS NOT NULL OR dispatch_actor_snapshot IS NOT NULL OR dispatch_wait_reason IS NOT NULL)
    OR EXISTS (SELECT id FROM svo.occurrence_events WHERE event_type IN
      ('DISPATCH_REQUESTED', 'DISPATCH_ATTEMPTED', 'DISPATCHED', 'DISPATCH_WAITING'))
    OR EXISTS (SELECT id FROM svo.execution_orders WHERE team_shift_id IS NOT NULL OR allocation_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback recusado para preservar plantões e histórico de despacho SVO. Reverta apenas a aplicação.';
  END IF;
END;
$$;

DROP INDEX svo.svo_occurrences_dispatch_queue;

ALTER TABLE svo.execution_orders
  DROP COLUMN team_shift_id,
  DROP COLUMN allocation_snapshot;

ALTER TABLE svo.occurrence_events
  DROP CONSTRAINT occurrence_events_event_type_check,
  ADD CONSTRAINT occurrence_events_event_type_check CHECK (event_type IN (
    'RECEIVED', 'TRIAGED', 'CONFIRMED', 'UPDATED', 'CANCELED', 'REOPENED', 'RECTIFIED', 'ANNULLED'
  ));

ALTER TABLE svo.occurrences
  DROP CONSTRAINT svo_occurrences_dispatch_wait_reason_valid,
  DROP CONSTRAINT svo_occurrences_dispatch_intent_consistent,
  DROP COLUMN dispatch_requested_at,
  DROP COLUMN dispatch_requested_by,
  DROP COLUMN dispatch_actor_snapshot,
  DROP COLUMN dispatch_wait_reason;

ALTER TABLE svo.team_events
  DROP CONSTRAINT team_events_event_type_check,
  ADD CONSTRAINT team_events_event_type_check CHECK (event_type IN (
    'CREATED', 'UPDATED', 'STATUS_CHANGED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'RECTIFIED', 'ANNULLED'
  ));

DROP INDEX svo.svo_team_shifts_by_team_period;
DROP TABLE svo.team_shifts;

COMMIT;
