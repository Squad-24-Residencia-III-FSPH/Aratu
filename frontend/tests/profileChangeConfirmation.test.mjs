import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveProfileChangeConfirmation,
  shouldConfirmProfileChange,
} from '../src/users/profileChangeConfirmation.ts'
import { updateUser } from '../src/services/usersService.ts'

test('mudança de perfil em usuário existente exige confirmação', () => {
  assert.equal(shouldConfirmProfileChange('edit', 'role-1', 'role-2'), true)
})

test('cadastro e edição sem mudança de perfil não exigem confirmação', () => {
  assert.equal(shouldConfirmProfileChange('create', null, 'role-2'), false)
  assert.equal(shouldConfirmProfileChange('edit', 'role-1', 'role-1'), false)
  assert.equal(shouldConfirmProfileChange('edit', null, 'role-2'), false)
})

test('cancelar mudança de perfil não chama a operação de gravação', async () => {
  let requests = 0
  await resolveProfileChangeConfirmation('cancelled', async () => { requests += 1 })
  assert.equal(requests, 0)
})

test('confirmar mudança de perfil envia um PUT com roleId e revision', async () => {
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return Response.json({
      id: '7',
      name: 'Usuária Fictícia',
      email: 'usuaria@example.test',
      roleId: '2',
      role: 'GESTOR',
      active: true,
      revision: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
  }

  await resolveProfileChangeConfirmation('confirmed', async () => {
    await updateUser(api, '7', {
      name: 'Usuária Fictícia',
      email: 'usuaria@example.test',
      roleId: '2',
      revision: 2,
    })
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/users/7')
  assert.equal(calls[0].options.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: 'Usuária Fictícia',
    email: 'usuaria@example.test',
    roleId: '2',
    revision: 2,
  })
})
