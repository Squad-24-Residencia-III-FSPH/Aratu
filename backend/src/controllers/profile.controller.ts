import type { Request, Response } from 'express'
import type { ProfileServiceContract } from '../services/profile.service'
import { ProfileServiceError } from '../services/profile.service'
import type { ProfileFilters } from '../types/permission.types'

/** Cria handlers HTTP para consulta e manutenção auditável dos perfis RBAC. */
export function createProfileController(profileService: ProfileServiceContract) {
  function handleError(error: unknown, res: Response): void {
    if (error instanceof ProfileServiceError) {
      res.status(error.status).json({ erro: error.message })
      return
    }
    throw error
  }

  function actor(request: Request) {
    if (!request.usuario) throw new ProfileServiceError(401, 'Autenticação necessária.')
    return request.usuario
  }

  function listFilters(query: Request['query']): ProfileFilters {
    const filters: ProfileFilters = {}
    const active = query.active
    if (active === 'true' || active === 'false') filters.active = active === 'true'
    else if (active !== undefined) throw new ProfileServiceError(400, 'Filtro de situação inválido.')
    if (typeof query.search === 'string') filters.search = query.search
    if (typeof query.page === 'string') filters.page = Number(query.page)
    if (typeof query.pageSize === 'string') filters.pageSize = Number(query.pageSize)
    return filters
  }

  return {
    /** Lista perfis; a versão paginada é ativada quando a tela envia page/pageSize. */
    async list(req: Request, res: Response): Promise<void> {
      try {
        const filters = listFilters(req.query)
        const result = await profileService.listProfiles(filters)
        res.status(200).json(result)
      } catch (error) { handleError(error, res) }
    },

    /** Retorna metadados, revisão, usuários vinculados e grants ativos do perfil. */
    async detail(req: Request, res: Response): Promise<void> {
      try {
        res.status(200).json(await profileService.getProfile(String(req.params.id)))
      } catch (error) { handleError(error, res) }
    },

    /** Expõe códigos da aplicação que têm comportamento implementado. */
    async permissions(_req: Request, res: Response): Promise<void> {
      try {
        const permissions = await profileService.listPermissionCatalog()
        const grouped = new Map<string, typeof permissions>()
        for (const permission of permissions) {
          const modulePermissions = grouped.get(permission.module) ?? []
          modulePermissions.push(permission)
          grouped.set(permission.module, modulePermissions)
        }
        res.status(200).json([...grouped].map(([module, items]) => ({ module, permissions: items })))
      }
      catch (error) { handleError(error, res) }
    },

    /** Cria perfil e matriz na mesma operação idempotente. */
    async create(req: Request, res: Response): Promise<void> {
      try {
        const result = await profileService.createProfile(req.body, actor(req), req.get('Idempotency-Key'))
        res.status(result.replayed ? 200 : 201).json(result.role)
      } catch (error) { handleError(error, res) }
    },

    /** Atualiza dados e grants usando expectedRevision para evitar sobrescrita concorrente. */
    async update(req: Request, res: Response): Promise<void> {
      try {
        res.status(200).json(await profileService.updateProfile(String(req.params.id), req.body, actor(req)))
      } catch (error) { handleError(error, res) }
    },

    /** Altera a disponibilidade do perfil sem excluir registros relacionados. */
    async setActive(req: Request, res: Response, active: boolean): Promise<void> {
      try {
        res.status(200).json(await profileService.setProfileActive(String(req.params.id), req.body, actor(req), active))
      } catch (error) { handleError(error, res) }
    },
  }
}
