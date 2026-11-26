import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient } from '../src/api/client.ts'
import {
  listProfiles,
  PROFILE_ACCESS_DENIED_MESSAGE,
  ProfileListError,
} from '../src/services/profileService.ts'
import { sessionFor } from './fixtures.mjs'

const profilesPayload = [
  { id: '1', name: 'ADMINISTRADOR', displayName: 'Administrador do Sistema', description: 'Administração do sistema', active: true, revision: 1, defaultPath: '/administracao/usuarios', activeUserCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'GESTOR', displayName: 'Gestor de Frota', description: 'Gestão de frota', active: true, revision: 1, defaultPath: '/solicitacoes/analisar', activeUserCount: 2, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '3', name: 'SOLICITANTE', displayName: 'Solicitante Interno', description: 'Solicitações', active: true, revision: 1, defaultPath: '/solicitacoes/minhas', activeUserCount: 3, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '4', name: 'MOTORISTA', displayName: 'Motorista', description: 'Viagens atribuídas', active: true, revision: 1, defaultPath: '/viagens/minhas', activeUserCount: 4, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '5', name: 'ATENDENTE_SVO', displayName: 'Atendente SVO', description: 'Triagem SVO', active: true, revision: 1, defaultPath: '/svo/solicitacoes', activeUserCount: 5, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '6', name: 'EQUIPE_SVO', displayName: 'Equipe SVO', description: null, active: true, revision: 1, defaultPath: '/svo/ordens', activeUserCount: 6, createdAt: '2026-01-01T00:00:00.000Z' },
]

test('consulta GET /profiles e adapta name para o perfil canônico mantendo descrição da API', async () => {
  let requestedPath
  let requestOptions
  const profiles = await listProfiles(async (path, options) => {
    requestedPath = path
    requestOptions = options
    return Response.json(profilesPayload)
  })

  assert.equal(requestedPath, '/profiles')
  assert.equal(requestOptions.cache, 'no-store')
  assert.deepEqual(profiles.map(({ name }) => name), [
    'ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO',
  ])
  assert.deepEqual(profiles.map(({ displayName }) => displayName), [
    'Administrador do Sistema', 'Gestor de Frota', 'Solicitante Interno', 'Motorista', 'Atendente SVO', 'Equipe SVO',
  ])
  assert.equal(profiles[0].description, 'Administração do sistema')
  assert.equal(profiles[5].description, null)
})

test('integra a consulta de perfis com o cliente autenticado e seu Bearer', async () => {
  const session = sessionFor('ADMINISTRADOR')
  const api = createApiClient({
    baseUrl: '/api',
    getSession: () => session,
    onUnauthorized: () => assert.fail('A resposta simulada não é 401'),
    fetcher: async (url, options) => {
      assert.equal(url, '/api/profiles')
      assert.equal(options.headers.get('Authorization'), `Bearer ${session.token}`)
      assert.equal(options.cache, 'no-store')
      return Response.json(profilesPayload)
    },
  })

  assert.equal((await listProfiles(api)).length, 6)
})

test('resposta 403 é classificada como acesso negado sem converter em falha de sessão', async () => {
  await assert.rejects(
    listProfiles(async () => Response.json({ erro: 'Acesso negado' }, { status: 403 })),
    (error) => error instanceof ProfileListError
      && error.kind === 'forbidden'
      && error.message === PROFILE_ACCESS_DENIED_MESSAGE,
  )
})

test('array vazio é retornado para a página apresentar o estado vazio', async () => {
  assert.deepEqual(await listProfiles(async () => Response.json([])), [])
})

test('consulta perfis com filtros e adapta o envelope paginado do servidor', async () => {
  let requestedPath
  const result = await listProfiles(async (path) => {
    requestedPath = path
    return Response.json({ profiles: profilesPayload.slice(1, 2), total: 14, page: 2, pageSize: 10, totalPages: 2 })
  }, { active: true, search: '  gestor  ', page: 2, pageSize: 10 })

  assert.equal(requestedPath, '/profiles?active=true&search=gestor&page=2&pageSize=10')
  assert.deepEqual([result.total, result.page, result.pageSize, result.totalPages], [14, 2, 10, 2])
  assert.equal(result.profiles[0].displayName, 'Gestor de Frota')
})

test('resposta fora do contrato é tratada como indisponibilidade', async () => {
  await assert.rejects(
    listProfiles(async () => Response.json([{ id: 1, name: 'GESTOR', description: null, createdAt: 'hoje' }])),
    (error) => error instanceof ProfileListError && error.kind === 'unavailable',
  )
})

test('perfil personalizado retornado pela API é preservado para o RBAC dinâmico', async () => {
  const profiles = await listProfiles(async () => Response.json([{
      id: '9',
      name: 'SUPERVISOR_OPERACIONAL',
      displayName: 'Supervisor Operacional',
      description: 'Perfil sem mapeamento',
      active: true,
      revision: 1,
      defaultPath: '/trips',
      activeUserCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    }]))

  assert.equal(profiles[0].name, 'SUPERVISOR_OPERACIONAL')
  assert.equal(profiles[0].displayName, 'Supervisor Operacional')
})

test('erros HTTP diferentes de 403 preservam a mensagem do backend', async () => {
  await assert.rejects(
    listProfiles(async () => Response.json({ erro: 'Serviço temporariamente indisponível.' }, { status: 503 })),
    { message: 'Serviço temporariamente indisponível.' },
  )
})
