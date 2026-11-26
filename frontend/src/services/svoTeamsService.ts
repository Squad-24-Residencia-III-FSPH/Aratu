import type { ApiRequest } from '../api/client.ts'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { SvoOccurrenceRequestError } from '../svo/svoOccurrenceTypes.ts'

export interface SvoTeamMemberRecord {
  id: string
  userId: string
  name: string
  active: boolean
  joinedAt: string
  leftAt: string | null
}

export interface SvoTeamShiftRecord {
  id: string
  startsAt: string
  endsAt: string
  canceledAt: string | null
  cancellationReason: string | null
  revision: number
}

export interface SvoTeamRecord {
  id: string
  name: string
  active: boolean
  revision: number
  members: SvoTeamMemberRecord[]
  shifts: SvoTeamShiftRecord[]
}

export interface SvoEligibleMemberRecord { id: string; name: string; email: string }
export interface SvoTeamFilters {
  view: 'operational' | 'archived' | 'all'
  search?: string
  page: number
  pageSize: number
}
export interface SvoTeamPage {
  items: SvoTeamRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const id = (value: unknown): value is string => string(value) && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const iso = (value: unknown): value is string => string(value) && Number.isFinite(Date.parse(value))
const nullableIso = (value: unknown): value is string | null => value === null || iso(value)
const invalid = () => new SvoOccurrenceRequestError('invalidResponse', 'Os dados de equipes recebidos do servidor estão incompletos.')

function parseTeam(value: unknown): SvoTeamRecord {
  if (!record(value) || !id(value.id) || !string(value.name) || typeof value.active !== 'boolean' || !revision(value.revision)
    || !Array.isArray(value.members) || !Array.isArray(value.shifts)) throw invalid()
  const members = value.members.map((member): SvoTeamMemberRecord => {
    if (!record(member) || !id(member.id) || !id(member.userId) || !string(member.name) || typeof member.active !== 'boolean'
      || !iso(member.joinedAt) || !nullableIso(member.leftAt)) throw invalid()
    return { id: member.id, userId: member.userId, name: member.name, active: member.active, joinedAt: member.joinedAt, leftAt: member.leftAt }
  })
  const shifts = value.shifts.map((shift): SvoTeamShiftRecord => {
    if (!record(shift) || !id(shift.id) || !iso(shift.startsAt) || !iso(shift.endsAt) || !nullableIso(shift.canceledAt)
      || !(shift.cancellationReason === null || string(shift.cancellationReason)) || !revision(shift.revision)) throw invalid()
    return { id: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt, canceledAt: shift.canceledAt,
      cancellationReason: shift.cancellationReason, revision: shift.revision }
  })
  return { id: value.id, name: value.name, active: value.active, revision: value.revision, members, shifts }
}

async function request(api: ApiRequest, path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try { response = await api(path, init) }
  catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) throw new SvoOccurrenceRequestError('session', SESSION_EXPIRED)
    if (error instanceof Error && error.message === SERVICE_UNAVAILABLE) throw new SvoOccurrenceRequestError('network', SERVICE_UNAVAILABLE)
    throw new SvoOccurrenceRequestError('network', 'Não foi possível se comunicar com o servidor. Verifique a conexão.')
  }
  if (!response.ok) {
    const kind = response.status === 400 ? 'validation' : response.status === 401 ? 'session' : response.status === 403 ? 'forbidden'
      : response.status === 404 ? 'notFound' : response.status === 409 ? 'conflict' : response.status >= 500 ? 'server' : 'rejected'
    const body: unknown = await response.json().catch(() => null)
    throw new SvoOccurrenceRequestError(kind, record(body) && string(body.erro) ? body.erro : `A API respondeu HTTP ${response.status}.`)
  }
  try { return await response.json() } catch { throw invalid() }
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export async function listSvoTeams(api: ApiRequest): Promise<SvoTeamRecord[]> {
  const value = await request(api, '/svo/teams')
  if (!Array.isArray(value)) throw invalid()
  return value.map(parseTeam)
}

/** Busca uma página calculada pelo servidor com recorte de atividade e busca por nome. */
export async function listSvoTeamPage(api: ApiRequest, filters: SvoTeamFilters): Promise<SvoTeamPage> {
  const params = new URLSearchParams({ view: filters.view, page: String(filters.page), pageSize: String(filters.pageSize) })
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  const value = await request(api, `/svo/teams?${params.toString()}`)
  if (!record(value) || !Array.isArray(value.items) || !Number.isSafeInteger(value.total) || Number(value.total) < 0
    || !Number.isSafeInteger(value.page) || Number(value.page) !== filters.page
    || !Number.isSafeInteger(value.pageSize) || Number(value.pageSize) !== filters.pageSize
    || !Number.isSafeInteger(value.totalPages) || Number(value.totalPages) < 0
    || Number(value.totalPages) !== Math.ceil(Number(value.total) / filters.pageSize)) throw invalid()
  return {
    items: value.items.map(parseTeam),
    total: Number(value.total),
    page: Number(value.page),
    pageSize: Number(value.pageSize),
    totalPages: Number(value.totalPages),
  }
}

export async function listEligibleSvoMembers(api: ApiRequest): Promise<SvoEligibleMemberRecord[]> {
  const value = await request(api, '/svo/teams/eligible-members')
  if (!Array.isArray(value)) throw invalid()
  return value.map((member): SvoEligibleMemberRecord => {
    if (!record(member) || !id(member.id) || !string(member.name) || !string(member.email)) throw invalid()
    return { id: member.id, name: member.name, email: member.email }
  })
}

export async function createSvoTeam(api: ApiRequest, name: string): Promise<SvoTeamRecord> {
  return parseTeam(await request(api, '/svo/teams', json('POST', { name })))
}

export async function updateSvoTeam(api: ApiRequest, team: SvoTeamRecord, input: { name: string; active: boolean; reason: string }): Promise<SvoTeamRecord> {
  return parseTeam(await request(api, `/svo/teams/${team.id}`, json('PUT', { expectedRevision: team.revision, ...input })))
}

export async function addSvoTeamMember(api: ApiRequest, teamId: string, userId: string): Promise<SvoTeamRecord> {
  return parseTeam(await request(api, `/svo/teams/${teamId}/members`, json('POST', { userId })))
}

export async function removeSvoTeamMember(api: ApiRequest, teamId: string, userId: string, reason: string): Promise<SvoTeamRecord> {
  return parseTeam(await request(api, `/svo/teams/${teamId}/members/${userId}`, json('DELETE', { reason })))
}

export async function createSvoShift(api: ApiRequest, teamId: string, input: { startsAt: string; endsAt: string }): Promise<SvoTeamShiftRecord> {
  const value = await request(api, `/svo/teams/${teamId}/shifts`, json('POST', input))
  return parseShift(value)
}

export async function updateSvoShift(api: ApiRequest, teamId: string, shift: SvoTeamShiftRecord, input: { startsAt: string; endsAt: string; reason: string }): Promise<SvoTeamShiftRecord> {
  const value = await request(api, `/svo/teams/${teamId}/shifts/${shift.id}`, json('PUT', { expectedRevision: shift.revision, ...input }))
  return parseShift(value)
}

export async function cancelSvoShift(api: ApiRequest, teamId: string, shift: SvoTeamShiftRecord, reason: string): Promise<SvoTeamShiftRecord> {
  const value = await request(api, `/svo/teams/${teamId}/shifts/${shift.id}/cancel`, json('PATCH', { expectedRevision: shift.revision, reason }))
  return parseShift(value)
}

function parseShift(value: unknown): SvoTeamShiftRecord {
  if (!record(value) || !id(value.id) || !iso(value.startsAt) || !iso(value.endsAt) || !nullableIso(value.canceledAt)
    || !(value.cancellationReason === null || string(value.cancellationReason)) || !revision(value.revision)) throw invalid()
  return { id: value.id, startsAt: value.startsAt, endsAt: value.endsAt, canceledAt: value.canceledAt,
    cancellationReason: value.cancellationReason, revision: value.revision }
}
