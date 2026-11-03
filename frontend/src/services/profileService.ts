import type { ApiRequest } from '../api/client'
import { resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'

export interface ProfileOption {
  id: string
  name: Profile
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.erro !== 'string' || !value.erro.trim()) return
  return value.erro
}

function parseProfiles(value: unknown): ProfileOption[] {
  if (!Array.isArray(value)) {
    throw new Error('A resposta de perfis da API está em um formato inválido.')
  }

  return value.map((item): ProfileOption => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw new Error('A resposta de perfis da API está em um formato inválido.')
    }
    const name = resolveProfile(item.name)
    if (!name) throw new Error('A API retornou um perfil não reconhecido pelo frontend.')
    return { id: item.id, name }
  })
}

export async function listProfiles(api: ApiRequest): Promise<ProfileOption[]> {
  const response = await api('/profiles')
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(getErrorMessage(body) ?? 'Não foi possível carregar os perfis de acesso.')
  }
  return parseProfiles(body)
}
