import type { Request, Response } from 'express'
import type { ProfileServiceContract } from '../services/profile.service'

/**
 * Cria o controlador responsável pela listagem de perfis do sistema.
 *
 * @param profileService - Serviço de consulta dos perfis RBAC.
 * @returns Objeto contendo os handlers HTTP para as operações de perfis.
 */
export function createProfileController(profileService: ProfileServiceContract) {
  return {
    /**
     * Lista todos os perfis de acesso RBAC cadastrados no Sistema Aratu.
     *
     * Retorna um array de objetos contendo id, name e description para
     * alimentar seletores de perfil no frontend.
     */
    async list(_req: Request, res: Response): Promise<void> {
      const roles = await profileService.listProfiles()
      res.status(200).json(roles)
    },
  }
}
