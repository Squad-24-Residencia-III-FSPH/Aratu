BEGIN;

CREATE SCHEMA IF NOT EXISTS svo;

CREATE TABLE svo.teams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  active BOOLEAN NOT NULL DEFAULT true,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX svo_teams_name_lower_unique
  ON svo.teams (lower(btrim(name)));

CREATE INDEX svo_teams_by_active_name
  ON svo.teams (active, name, id);

CREATE TABLE svo.team_members (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES svo.teams (id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_team_members_unique UNIQUE (team_id, user_id),
  CONSTRAINT svo_team_members_period_valid CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE INDEX svo_team_members_by_team
  ON svo.team_members (team_id, active, id);

CREATE INDEX svo_team_members_by_user
  ON svo.team_members (user_id, active, id);

CREATE TABLE svo.team_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES svo.teams (id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'RECTIFIED', 'ANNULLED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT CHECK (evidence_description IS NULL OR btrim(evidence_description) <> ''),
  attachment_url TEXT CHECK (attachment_url IS NULL OR btrim(attachment_url) <> ''),
  supersedes_id BIGINT REFERENCES svo.team_events (id) ON DELETE RESTRICT,
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT svo_team_events_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX svo_team_events_by_team
  ON svo.team_events (team_id, occurred_at DESC, id DESC);

CREATE INDEX svo_team_events_by_supersedes
  ON svo.team_events (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION svo.prevent_team_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'svo.team_events is append-only';
END;
$$;

CREATE TRIGGER svo_team_events_append_only
  BEFORE UPDATE OR DELETE ON svo.team_events
  FOR EACH ROW EXECUTE FUNCTION svo.prevent_team_event_mutation();

COMMIT;
