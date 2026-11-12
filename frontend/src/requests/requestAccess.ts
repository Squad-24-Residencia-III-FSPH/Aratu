import type { Profile } from '../auth/profiles.ts'

/** Caminho canônico de "Minhas solicitações" para o perfil SOLICITANTE. */
export const MY_REQUESTS_PATH = '/solicitacoes/minhas'

/** Caminho da página dedicada de criação de solicitação de viagem (FROTA-78 / US11). */
export const NEW_REQUEST_PATH = '/solicitacoes/nova'

/** Caminho legado mantido com redirecionamento automático para `/solicitacoes/minhas`. */
export const LEGACY_MY_REQUESTS_PATH = '/minhas-solicitacoes'

/** Caminho legado de início do solicitante, redirecionado para `/solicitacoes/minhas`. */
export const LEGACY_SOLICITANTE_HOME_PATH = '/inicio'

/** Indica se o perfil autenticado tem acesso às telas de solicitação de viagem (US11). */
export function canAccessRequests(profile: Profile | null): profile is 'SOLICITANTE' {
  return profile === 'SOLICITANTE'
}
