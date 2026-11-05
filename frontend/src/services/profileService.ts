import type { ApiRequest } from '../api/client.ts'
import { resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'

/** Campos de perfil usados pelos formulários administrativos compartilhados. */
export interface ProfileOption {
  id: string
  name: Profile
}

/** Resumo de perfil exibido na página de permissões. */
export interface ProfileSummary extends ProfileOption {
  profile: Profile
  description: string | null
}

export type ProfileListErrorKind = 'forbidden' | 'unavailable'

export const PROFILE_ACCESS_DENIED_MESSAGE = 'Você não tem permissão para visualizar os perfis.'

export class ProfileListError extends Error {
  readonly kind: ProfileListErrorKind

  constructor(kind: ProfileListErrorKind, message?: string) {
    super(kind === 'forbidden'
      ? PROFILE_ACCESS_DENIED_MESSAGE
      : message ?? 'Não foi possível carregar os perfis.')
    this.name = 'ProfileListError'
    this.kind = kind
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProfile(value: unknown): ProfileSummary {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || !(typeof value.description === 'string' || value.description === null)
    || typeof value.createdAt !== 'string') {
    throw new ProfileListError('unavailable')
  }

  const profile = resolveProfile(value.name)
  if (!profile) throw new ProfileListError('unavailable')

  return {
    id: value.id,
    name: profile,
    profile,
    description: value.description,
  }
}

/** Lista os perfis usando o cliente autenticado fornecido pelo contexto da sessão. */
export async function listProfiles(api: ApiRequest): Promise<ProfileSummary[]> {
  const response = await api('/profiles', { cache: 'no-store' })
  if (response.status === 403) throw new ProfileListError('forbidden')
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
      ? body.erro
      : undefined
    throw new ProfileListError('unavailable', message)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProfileListError('unavailable')
  }

  if (!Array.isArray(payload)) throw new ProfileListError('unavailable')
  return payload.map(parseProfile)
}
