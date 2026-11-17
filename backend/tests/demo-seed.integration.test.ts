import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { seedDemo, demoEmail } from '../src/database/scripts/seed-demo'
import { USER_ROLES } from '../src/types/auth'
import { UsersRepository } from '../src/repositories/users.repository'
import { comparePassword } from '../src/services/password.service'
import { setupTestDatabase, getTestPool, closeTestPool, truncateTestDatabase } from './helpers/db-test'

before(async () => { await setupTestDatabase(); await truncateTestDatabase() })
after(closeTestPool)

test('seed de homologação cria seis perfis e reexecução preserva senha e identidade', async () => {
  const pool = getTestPool()
  const password = 'senha-ficticia-demo-segura'
  await seedDemo(pool, password)
  const repository = new UsersRepository(pool)
  const original = await repository.findByEmail(demoEmail('ADMINISTRADOR'))
  await seedDemo(pool, 'outra-senha-ficticia-segura')
  for (const role of USER_ROLES) {
    const user = await repository.findByEmail(demoEmail(role))
    assert.equal(user?.role, role)
    assert.equal(user?.is_active, true)
    assert.equal(await comparePassword(password, user?.password_hash ?? ''), true)
  }
  assert.equal((await repository.findByEmail(demoEmail('ADMINISTRADOR')))?.id, original?.id)
  await assert.rejects(seedDemo(pool, 'curta'), /12 caracteres/)
})
