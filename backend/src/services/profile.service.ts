import type { RoleRepositoryContract } from '../repositories/roles.repository'
import type { Role } from '../types/auth'

/** Contrato consumido pela borda HTTP para consulta de perfis RBAC. */
export interface ProfileServiceContract {
  listProfiles(): Promise<Role[]>
}

/**
 * Centraliza a consulta de perfis de acesso disponíveis para os fluxos administrativos.
 *
 * Mantém o controller independente da persistência para que regras futuras de perfis,
 * como filtragem por contexto operacional, permaneçam na camada de serviço.
 */
export class ProfileService implements ProfileServiceContract {
  constructor(private readonly rolesRepository: RoleRepositoryContract) {}

  /**
   * Lista os perfis RBAC cadastrados para seleção por um administrador autenticado.
   *
   * @returns Perfis ordenados pelo identificador de persistência.
   */
  async listProfiles(): Promise<Role[]> {
    return this.rolesRepository.findAll()
  }
}
