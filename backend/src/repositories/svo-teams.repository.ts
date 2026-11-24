import type { Pool, PoolClient } from 'pg'
import type { SvoActorSnapshot } from '../types/svo-occurrence.types'
import type { SvoEligibleMember, SvoTeam, SvoTeamEventInput, SvoTeamMember, SvoTeamShift } from '../types/svo-team.types'

export interface SvoTeamsRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findActor(id: string, client: PoolClient): Promise<SvoActorSnapshot | null>
  currentTime(client: PoolClient): Promise<Date>
  list(): Promise<SvoTeam[]>
  listEligibleMembers(): Promise<SvoEligibleMember[]>
  findTeamForUpdate(id: string, client: PoolClient): Promise<Pick<SvoTeam, 'id' | 'name' | 'active' | 'revision'> | null>
  createTeam(name: string, client: PoolClient): Promise<SvoTeam>
  updateTeam(id: string, revision: number, name: string, active: boolean, time: Date, client: PoolClient): Promise<boolean>
  findMemberForUpdate(teamId: string, userId: string, client: PoolClient): Promise<SvoTeamMember | null>
  addMember(teamId: string, userId: string, time: Date, client: PoolClient): Promise<SvoTeamMember>
  removeMember(teamId: string, userId: string, time: Date, client: PoolClient): Promise<boolean>
  isEligibleMember(userId: string, client: PoolClient): Promise<boolean>
  findShiftForUpdate(teamId: string, shiftId: string, client: PoolClient): Promise<SvoTeamShift | null>
  hasOverlappingShift(teamId: string, startsAt: Date, endsAt: Date, exceptId: string | null, client: PoolClient): Promise<boolean>
  createShift(teamId: string, startsAt: Date, endsAt: Date, userId: string, time: Date, client: PoolClient): Promise<SvoTeamShift>
  updateShift(teamId: string, shiftId: string, revision: number, startsAt: Date, endsAt: Date, time: Date, client: PoolClient): Promise<boolean>
  cancelShift(teamId: string, shiftId: string, revision: number, reason: string, time: Date, client: PoolClient): Promise<boolean>
  createEvent(event: SvoTeamEventInput, client: PoolClient): Promise<void>
  findById(id: string): Promise<SvoTeam | null>
}

/** Consultas de composição e plantões do SVO; mutações são serializadas pela equipe. */
export class SvoTeamsRepository implements SvoTeamsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async findActor(id: string, client: PoolClient): Promise<SvoActorSnapshot | null> {
    const result = await client.query<SvoActorSnapshot>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true FOR SHARE OF u, r`, [id],
    )
    return result.rows[0] ?? null
  }

  async currentTime(client: PoolClient): Promise<Date> {
    const result = await client.query<{ time: Date }>('SELECT clock_timestamp() AS time')
    return result.rows[0]!.time
  }

  async list(): Promise<SvoTeam[]> { return this.listWith(this.pool) }

  async findById(id: string): Promise<SvoTeam | null> {
    return (await this.listWith(this.pool, id))[0] ?? null
  }

  private async listWith(executor: Pool | PoolClient, id?: string): Promise<SvoTeam[]> {
    const result = await executor.query<SvoTeam>(
      `SELECT t.id::text AS id, t.name, t.active, t.revision,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', m.id::text, 'userId', m.user_id::text, 'name', u.name, 'active', m.active,
          'joinedAt', m.joined_at, 'leftAt', m.left_at
        ) ORDER BY m.active DESC, u.name, m.id)
          FROM svo.team_members m JOIN auth.users u ON u.id = m.user_id WHERE m.team_id = t.id), '[]'::jsonb) AS members,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id::text, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'canceledAt', s.canceled_at,
          'cancellationReason', s.cancellation_reason, 'revision', s.revision
        ) ORDER BY s.starts_at DESC, s.id DESC)
          FROM svo.team_shifts s WHERE s.team_id = t.id), '[]'::jsonb) AS shifts
       FROM svo.teams t WHERE ($1::bigint IS NULL OR t.id = $1)
       ORDER BY t.active DESC, lower(t.name), t.id`, [id ?? null],
    )
    return result.rows
  }

  async listEligibleMembers(): Promise<SvoEligibleMember[]> {
    const result = await this.pool.query<SvoEligibleMember>(
      `SELECT u.id::text AS id, u.name, u.email FROM auth.users u
        JOIN auth.roles r ON r.id = u.role_id
       WHERE u.active = true AND r.name = 'EQUIPE_SVO' ORDER BY u.name, u.id`,
    )
    return result.rows
  }

  async findTeamForUpdate(id: string, client: PoolClient): Promise<Pick<SvoTeam, 'id' | 'name' | 'active' | 'revision'> | null> {
    const result = await client.query<Pick<SvoTeam, 'id' | 'name' | 'active' | 'revision'>>(
      'SELECT id::text AS id, name, active, revision FROM svo.teams WHERE id = $1 FOR UPDATE', [id],
    )
    return result.rows[0] ?? null
  }

  async createTeam(name: string, client: PoolClient): Promise<SvoTeam> {
    const result = await client.query<{ id: string }>(
      'INSERT INTO svo.teams (name, active) VALUES ($1, true) RETURNING id::text AS id', [name],
    )
    const team = await this.readWithClient(result.rows[0]!.id, client)
    if (!team) throw new Error('Não foi possível recuperar a equipe SVO criada.')
    return team
  }

  async updateTeam(id: string, revision: number, name: string, active: boolean, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `UPDATE svo.teams SET name = $1, active = $2, revision = revision + 1, updated_at = $3
        WHERE id = $4 AND revision = $5`, [name, active, time, id, revision],
    )
    return result.rowCount === 1
  }

  async findMemberForUpdate(teamId: string, userId: string, client: PoolClient): Promise<SvoTeamMember | null> {
    const result = await client.query<SvoTeamMember>(
      `SELECT m.id::text AS id, m.user_id::text AS "userId", u.name, m.active,
          m.joined_at AS "joinedAt", m.left_at AS "leftAt"
         FROM svo.team_members m JOIN auth.users u ON u.id = m.user_id
        WHERE m.team_id = $1 AND m.user_id = $2 FOR UPDATE OF m`, [teamId, userId],
    )
    return result.rows[0] ?? null
  }

  async isEligibleMember(userId: string, client: PoolClient): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT u.id::text AS id FROM auth.users u JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true AND r.name = 'EQUIPE_SVO' FOR SHARE OF u, r`, [userId],
    )
    return result.rows.length > 0
  }

  async addMember(teamId: string, userId: string, time: Date, client: PoolClient): Promise<SvoTeamMember> {
    const result = await client.query<SvoTeamMember>(
      `INSERT INTO svo.team_members (team_id, user_id, active, joined_at, left_at)
       VALUES ($1, $2, true, $3, NULL)
       ON CONFLICT (team_id, user_id) DO UPDATE SET active = true, joined_at = $3, left_at = NULL, updated_at = $3
         WHERE svo.team_members.active = false
       RETURNING id::text AS id, user_id::text AS "userId",
         (SELECT name FROM auth.users WHERE id = user_id) AS name, active,
         joined_at AS "joinedAt", left_at AS "leftAt"`, [teamId, userId, time],
    )
    return result.rows[0]!
  }

  async removeMember(teamId: string, userId: string, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `UPDATE svo.team_members SET active = false, left_at = $3, updated_at = $3
        WHERE team_id = $1 AND user_id = $2 AND active = true`, [teamId, userId, time],
    )
    return result.rowCount === 1
  }

  async findShiftForUpdate(teamId: string, shiftId: string, client: PoolClient): Promise<SvoTeamShift | null> {
    const result = await client.query<SvoTeamShift>(
      `SELECT id::text AS id, starts_at AS "startsAt", ends_at AS "endsAt", canceled_at AS "canceledAt",
          cancellation_reason AS "cancellationReason", revision FROM svo.team_shifts
        WHERE team_id = $1 AND id = $2 FOR UPDATE`, [teamId, shiftId],
    )
    return result.rows[0] ?? null
  }

  async hasOverlappingShift(teamId: string, startsAt: Date, endsAt: Date, exceptId: string | null, client: PoolClient): Promise<boolean> {
    const result = await client.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM svo.team_shifts WHERE team_id = $1 AND canceled_at IS NULL
          AND ends_at > $2 AND starts_at < $3 AND ($4::bigint IS NULL OR id <> $4)) AS found`,
      [teamId, startsAt, endsAt, exceptId],
    )
    return result.rows[0]!.found
  }

  async createShift(teamId: string, startsAt: Date, endsAt: Date, userId: string, time: Date, client: PoolClient): Promise<SvoTeamShift> {
    const result = await client.query<SvoTeamShift>(
      `INSERT INTO svo.team_shifts (team_id, starts_at, ends_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING id::text AS id, starts_at AS "startsAt", ends_at AS "endsAt", canceled_at AS "canceledAt",
         cancellation_reason AS "cancellationReason", revision`, [teamId, startsAt, endsAt, userId, time],
    )
    return result.rows[0]!
  }

  async updateShift(teamId: string, shiftId: string, revision: number, startsAt: Date, endsAt: Date, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `UPDATE svo.team_shifts SET starts_at = $1, ends_at = $2, revision = revision + 1, updated_at = $3
        WHERE team_id = $4 AND id = $5 AND revision = $6 AND canceled_at IS NULL`,
      [startsAt, endsAt, time, teamId, shiftId, revision],
    )
    return result.rowCount === 1
  }

  async cancelShift(teamId: string, shiftId: string, revision: number, reason: string, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `UPDATE svo.team_shifts SET canceled_at = $1, cancellation_reason = $2,
          revision = revision + 1, updated_at = $1
        WHERE team_id = $3 AND id = $4 AND revision = $5 AND canceled_at IS NULL`,
      [time, reason, teamId, shiftId, revision],
    )
    return result.rowCount === 1
  }

  async createEvent(event: SvoTeamEventInput, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO svo.team_events (team_id, event_type, occurred_at, reported_by, registered_by,
        actor_snapshot, reason, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb)`,
      [event.teamId, event.eventType, event.occurredAt, event.actor.name, event.actor.id,
        JSON.stringify(event.actor), event.reason, JSON.stringify(event.beforeState), JSON.stringify(event.afterState)],
    )
  }

  private async readWithClient(id: string, client: PoolClient): Promise<SvoTeam | null> {
    return (await this.listWith(client, id))[0] ?? null
  }
}
