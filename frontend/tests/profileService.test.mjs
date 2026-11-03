import test from 'node:test'
import assert from 'node:assert/strict'
import { listProfiles } from '../src/services/profileService.ts'

test('listProfiles uses the confirmed admin profile endpoint and parses profiles', async () => {
  const api = async (path) => {
    assert.equal(path, '/profiles')
    return new Response(JSON.stringify([
      { id: '1', name: 'ADMINISTRADOR', description: 'Admin profile' },
      { id: '2', name: 'GESTOR', description: null },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  assert.deepEqual(await listProfiles(api), [
    { id: '1', name: 'ADMINISTRADOR' },
    { id: '2', name: 'GESTOR' },
  ])
})

test('listProfiles reports API errors instead of treating them as an empty list', async () => {
  const api = async () => new Response(JSON.stringify({ erro: 'Acesso negado.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })

  await assert.rejects(listProfiles(api), { message: 'Acesso negado.' })
})

test('listProfiles rejects malformed and unknown profile responses', async () => {
  const malformedApi = async () => new Response(JSON.stringify({ profiles: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  const unknownProfileApi = async () => new Response(JSON.stringify([
    { id: '9', name: 'UNKNOWN_ROLE' },
  ]), { status: 200, headers: { 'Content-Type': 'application/json' } })

  await assert.rejects(listProfiles(malformedApi), /formato inválido/)
  await assert.rejects(listProfiles(unknownProfileApi), /perfil não reconhecido/)
})
