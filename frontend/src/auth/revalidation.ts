import { resolveProfile } from './profiles.ts'
import type { Profile } from './profiles.ts'

/**
 * Intervalo mínimo entre revalidações automáticas ao retomar foco/visibilidade da aba.
 * Evita rajadas de requisições ao alternar janelas rapidamente.
 */
export const REVALIDATION_THROTTLE_MS = 15_000

const PROFILE_REVALIDATION_PATHS: Record<Profile, string> = {
  ADMINISTRADOR: '/auth/me',
  GESTOR: '/auth/me',
  SOLICITANTE: '/auth/me',
  MOTORISTA: '/auth/me',
  ATENDENTE_SVO: '/auth/me',
  EQUIPE_SVO: '/auth/me',
}

/**
 * Resolve o endpoint autenticado da API responsável por revalidar se a conta
 * do perfil informado permanece ativa (`GET /auth/me` com `createCurrentUserMiddleware`).
 *
 * @param perfil - Identificador ou rótulo de perfil retornado na sessão autenticada.
 * @returns Caminho relativo da API para sondagem `GET`, ou `null` quando o perfil for desconhecido.
 */
export function resolveRevalidationPath(perfil: string): string | null {
  const profile = resolveProfile(perfil)
  return profile ? PROFILE_REVALIDATION_PATHS[profile] : null
}
