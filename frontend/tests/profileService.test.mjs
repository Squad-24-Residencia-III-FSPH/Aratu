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
  { id: '1', name: 'ADMINISTRADOR', description: 'Administração do sistema', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'GESTOR', description: 'Gestão de frota', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '3', name: 'SOLICITANTE', description: 'Solicitações', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '4', name: 'MOTORISTA', description: 'Viagens atribuídas', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '5', name: 'ATENDENTE_SVO', description: 'Triagem SVO', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '6', name: 'EQUIPE_SVO', description: null, createdAt: '2026-01-01T00:00:00.000Z' },
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
  assert.deepEqual(profiles.map(({ name }) => name), profiles.map(({ profile }) => profile))
  assert.deepEqual(profiles.map(({ profile }) => profile), [
    'ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO',
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

test('resposta fora do contrato é tratada como indisponibilidade', async () => {
  await assert.rejects(
    listProfiles(async () => Response.json([{ id: 1, name: 'GESTOR', description: null, createdAt: 'hoje' }])),
    (error) => error instanceof ProfileListError && error.kind === 'unavailable',
  )
})

test('perfil desconhecido retornado pela API é rejeitado', async () => {
  await assert.rejects(
    listProfiles(async () => Response.json([{
      id: '9',
      name: 'UNKNOWN_ROLE',
      description: 'Perfil sem mapeamento',
      createdAt: '2026-01-01T00:00:00.000Z',
    }])),
    (error) => error instanceof ProfileListError && error.kind === 'unavailable',
  )
})

test('erros HTTP diferentes de 403 preservam a mensagem do backend', async () => {
  await assert.rejects(
    listProfiles(async () => Response.json({ erro: 'Serviço temporariamente indisponível.' }, { status: 503 })),
    { message: 'Serviço temporariamente indisponível.' },
  )
})
