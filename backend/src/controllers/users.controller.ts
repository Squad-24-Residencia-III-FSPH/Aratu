import type { NextFunction, Request, Response } from 'express'
import { UserServiceError } from '../types/user.types'
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserListFilters,
} from '../types/user.types'
import type { UsersService } from '../services/users.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

function queryText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function queryBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new UserServiceError(400, 'Filtro de situação inválido.')
}

function queryNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? Number(value) : Number.NaN
}

async function respondWithDomainErrors<T>(
  response: Response,
  next: NextFunction,
  operation: () => Promise<T>,
  successStatus = 200,
): Promise<void> {
  try {
    response.status(successStatus).json(await operation())
  } catch (error) {
    if (error instanceof UserServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta requisições HTTP de usuários para os casos de uso do service. */
export function createUsersController(service: UsersService) {
  return {
    /** Retorna a listagem paginada com filtros administrativos. */
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => {
        const name = queryText(req.query.nome)
        const role = queryText(req.query.perfil)
        const active = queryBoolean(req.query.ativo)
        const page = queryNumber(req.query.page)
        const pageSize = queryNumber(req.query.pageSize)
        const filters: UserListFilters = {
          ...(name ? { name } : {}),
          ...(role ? { role: role as NonNullable<UserListFilters['role']> } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
        }
        return service.listUsers(filters)
      })
    },

    /** Retorna o detalhe de um usuário pelo identificador da rota. */
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getUser(String(req.params.id)))
    },

    /** Cadastra usuário e retorna HTTP 201. */
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as CreateUserRequest
      return respondWithDomainErrors(
        res,
        next,
        () => service.createUser(input, req.usuario?.id ?? ''),
        201,
      )
    },

    /** Atualiza nome, e-mail e perfil sob controle de revisão. */
    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as UpdateUserRequest
      return respondWithDomainErrors(
        res,
        next,
        () => service.updateUser(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },

    /** Inativa a conta sem exclusão física. */
    deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(
        res,
        next,
        () => service.deactivateUser(String(req.params.id), req.usuario?.id ?? ''),
      )
    },

    /** Reativa a conta previamente inativada. */
    activate(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(
        res,
        next,
        () => service.activateUser(String(req.params.id), req.usuario?.id ?? ''),
      )
    },
  }
}
