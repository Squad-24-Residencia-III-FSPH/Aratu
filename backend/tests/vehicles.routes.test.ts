import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { after, before, test } from 'node:test'
import { createVehiclesRouter } from '../src/routes/vehicles.routes'
import type { VehiclesService } from '../src/services/vehicles.service'
import type { UserRole } from '../src/types/auth'
import { RBAC_JWT_CONFIG, RBAC_JWT_SECRET, generateRbacUserToken } from './fixtures/rbac-users.fixture'

const READ_ROLES: readonly UserRole[] = ['ADMINISTRADOR', 'GESTOR', 'ATENDENTE_SVO']
const WRITE_ROLES: readonly UserRole[] = ['ADMINISTRADOR', 'GESTOR']
const FORBIDDEN_BODY = {
  erro: 'Acesso negado: perfil de usuário não autorizado para esta operação.',
}

const vehicle = {
  id: '1',
  licensePlate: 'ABC1234',
  categories: ['PASSENGER'],
  seats: 4,
  bodyLimit: 0,
  weightLimit: null,
  operationType: 'ADMINISTRATIVE',
  status: 'AVAILABLE',
  revision: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const vehiclesService = {
  async listVehicles() { return [vehicle] },
  async getVehicle() { return vehicle },
  async createVehicle() { return vehicle },
  async updateVehicle() { return vehicle },
  async changeVehicleStatus() { return vehicle },
} as unknown as VehiclesService

const endpoints = [
  { method: 'GET', path: '/vehicles', allowedRoles: READ_ROLES, successStatus: 200, responseBody: [vehicle] },
  { method: 'GET', path: '/vehicles/1', allowedRoles: READ_ROLES, successStatus: 200, responseBody: vehicle },
  { method: 'POST', path: '/vehicles', allowedRoles: WRITE_ROLES, successStatus: 201, responseBody: vehicle },
  { method: 'PUT', path: '/vehicles/1', allowedRoles: WRITE_ROLES, successStatus: 200, responseBody: vehicle },
  { method: 'PATCH', path: '/vehicles/1/status', allowedRoles: WRITE_ROLES, successStatus: 200, responseBody: vehicle },
] as const

let server: Server
let baseUrl: string

before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/vehicles', createVehiclesRouter(vehiclesService, RBAC_JWT_CONFIG))
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})

test('rotas reais de veículos permitem e negam leitura e escrita conforme os papéis configurados', async () => {
  const roles: readonly UserRole[] = [
    'ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO',
  ]

  for (const endpoint of endpoints) {
    for (const [index, role] of roles.entries()) {
      const token = generateRbacUserToken({ id: String(index + 1), role }, RBAC_JWT_SECRET)
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(endpoint.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(endpoint.method === 'GET' ? {} : { body: '{}' }),
      })
      const isAllowed = endpoint.allowedRoles.some((allowedRole) => allowedRole === role)

      assert.equal(
        response.status,
        isAllowed ? endpoint.successStatus : 403,
        `${role} ${endpoint.method} ${endpoint.path} deve ser ${isAllowed ? 'permitido' : 'negado'}.`,
      )
      if (isAllowed) {
        assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(endpoint.responseBody)))
      } else {
        assert.deepEqual(await response.json(), FORBIDDEN_BODY)
      }
    }
  }
})
