import type { ManagedUser } from '../../users/userTypes'
import type { UserFormErrors } from '../../users/userFormValidation'

/** Campos validáveis no formulário administrativo de usuário, em ordem visual. */
export type UserFormField = keyof UserFormErrors

/** Ordem de foco para levar o teclado ao primeiro campo inválido do diálogo. */
export const USER_FORM_FIELD_ORDER: readonly UserFormField[] = [
  'name',
  'email',
  'roleId',
  'password',
]

/** Filtros ativos na listagem administrativa de usuários. */
export interface UserListFilterState {
  search: string
  roleFilter: string
  statusFilter: string
}

/** Estado de visibilidade de um registro recém-salvo em relação à tabela atual. */
export type SavedUserVisibility = 'visible' | 'filtered-out' | 'other-page'

/**
 * Retorna o primeiro campo com erro na ordem de leitura do formulário.
 *
 * @param errors - Mapa de mensagens de erro por campo.
 * @returns Chave do primeiro campo inválido ou `null` quando não há erros.
 */
export function firstInvalidUserField(errors: UserFormErrors): UserFormField | null {
  return USER_FORM_FIELD_ORDER.find((field) => Boolean(errors[field])) ?? null
}

/**
 * Associa mensagens de validação ou conflito vindas da API ao campo correspondente.
 *
 * @param message - Mensagem retornada pelo backend de usuários.
 * @returns Campo alvo (quando aplicável) e mensagem pronta para exibição.
 */
export function mapUserApiError(message: string): { field?: UserFormField; message: string } {
  const normalized = message.trim().toLowerCase()
  if (normalized.includes('nome do usuário')) {
    return { field: 'name', message }
  }
  if (normalized.includes('e-mail')) {
    return { field: 'email', message }
  }
  if (normalized.includes('perfil de acesso')) {
    return { field: 'roleId', message }
  }
  if (normalized.includes('senha') || normalized.includes('72 bytes')) {
    return { field: 'password', message }
  }
  return { message }
}

/**
 * Verifica se o usuário salvo satisfaz os filtros atualmente aplicados na tela.
 *
 * @param user - Registro persistido retornado pela API.
 * @param filters - Filtros de busca, perfil e situação ativos na UI.
 * @returns `true` quando o usuário pertence ao recorte filtrado.
 */
export function matchesUserListFilters(
  user: ManagedUser,
  filters: UserListFilterState,
): boolean {
  const term = filters.search.trim().toLocaleLowerCase()
  if (term) {
    const matchesName = user.name.toLocaleLowerCase().includes(term)
    const matchesEmail = user.email.toLocaleLowerCase().includes(term)
    if (!matchesName && !matchesEmail) return false
  }
  if (filters.roleFilter && user.role !== filters.roleFilter) {
    return false
  }
  if (filters.statusFilter === 'active' && !user.active) {
    return false
  }
  if (filters.statusFilter === 'inactive' && user.active) {
    return false
  }
  return true
}

/**
 * Identifica se um registro recém-salvo permanece visível na página atual ou saiu por filtro/paginação.
 *
 * @param savedUser - Registro retornado pela API após cadastro, edição ou mudança de situação.
 * @param visibleUsers - Linhas atualmente renderizadas na tabela.
 * @param filters - Filtros ativos na listagem.
 * @returns Classificação para orientar e permitir localizar o registro por ID.
 */
export function describeSavedUserVisibility(
  savedUser: ManagedUser,
  visibleUsers: readonly ManagedUser[],
  filters: UserListFilterState,
): SavedUserVisibility {
  if (visibleUsers.some((item) => item.id === savedUser.id)) {
    return 'visible'
  }
  return matchesUserListFilters(savedUser, filters) ? 'other-page' : 'filtered-out'
}
