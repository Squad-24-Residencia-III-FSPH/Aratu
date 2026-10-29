import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activateUser,
  buildUsersQuery,
  createUser,
  deactivateUser,
  listUsers,
  updateUser,
} from '../src/services/usersService.ts'

const user = {
  id: '7',
  name: 'Usuária Fictícia',
  email: 'usuaria@example.test',
  roleId: '1',
  role: 'ADMINISTRADOR',
  active: true,
  revision: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const page = {
  users: [user],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
}

test('buildUsersQuery omite filtros vazios e serializa os demais', () => {
  assert.equal(buildUsersQuery({}), '')
  assert.equal(
    buildUsersQuery({ name: '  Ana  ', role: 'GESTOR', active: false, page: 2, pageSize: 10 }),
    '?nome=Ana&perfil=GESTOR&ativo=false&page=2&pageSize=10',
  )
})

test('listUsers envia filtros e converte o envelope paginado', async () => {
  let requested = ''
  const api = async (path) => {
    requested = path
    return Response.json(page)
  }

  const result = await listUsers(api, { name: 'Usuária', role: 'ADMINISTRADOR', active: true, page: 1 })
  assert.equal(
    requested,
    '/users?nome=Usu%C3%A1ria&perfil=ADMINISTRADOR&ativo=true&page=1',
  )
  assert.equal(result.total, 1)
  assert.equal(result.users[0].role, 'ADMINISTRADOR')
  assert.equal(result.users[0].revision, 2)
})

test('listUsers prioriza a mensagem de erro da API e rejeita envelope inválido', async () => {
  const failure = async () => Response.json({ erro: 'Acesso negado' }, { status: 403 })
  await assert.rejects(listUsers(failure), { message: 'Acesso negado' })

  const malformed = async () => Response.json({ users: 'x' }, { status: 200 })
  await assert.rejects(listUsers(malformed), /formato inválido/)
})

test('createUser envia o corpo esperado e retorna o usuário criado', async () => {
  let captured = null
  const api = async (path, options) => {
    captured = { path, options }
    return Response.json(user, { status: 201 })
  }

  const created = await createUser(api, {
    name: 'Usuária Fictícia',
    email: 'usuaria@example.test',
    roleId: '1',
    password: 'senha-ficticia',
    active: true,
  })

  assert.equal(captured.path, '/users')
  assert.equal(captured.options.method, 'POST')
  assert.deepEqual(JSON.parse(captured.options.body), {
    name: 'Usuária Fictícia',
    email: 'usuaria@example.test',
    roleId: '1',
    password: 'senha-ficticia',
    active: true,
  })
  assert.equal(created.id, '7')
})

test('updateUser e ações de situação usam PUT/PATCH e codificam o identificador', async () => {
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return Response.json(user)
  }

  await updateUser(api, '7', {
    name: 'Usuária Fictícia',
    email: 'usuaria@example.test',
    roleId: '2',
    revision: 2,
  })
  await deactivateUser(api, '7')
  await activateUser(api, '7')

  assert.deepEqual(calls.map((call) => [call.path, call.options.method]), [
    ['/users/7', 'PUT'],
    ['/users/7/deactivate', 'PATCH'],
    ['/users/7/activate', 'PATCH'],
  ])
  assert.equal(JSON.parse(calls[0].options.body).revision, 2)
})

test('mutações propagam a mensagem de erro do backend', async () => {
  const api = async () => Response.json({ erro: 'E-mail já cadastrado.' }, { status: 409 })
  await assert.rejects(
    createUser(api, {
      name: 'Duplicada',
      email: 'duplicada@example.test',
      roleId: '1',
      password: 'x',
      active: true,
    }),
    { message: 'E-mail já cadastrado.' },
  )
})
