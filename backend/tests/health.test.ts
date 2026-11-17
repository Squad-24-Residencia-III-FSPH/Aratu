import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HealthService } from '../src/services/health.service'
import { loadCorsOrigin } from '../src/services/cors-config.service'
import { DatabaseMigrator } from '../src/database/migrator'

test('prontidão exige todas as migrations e falha fechada sem expor erro interno', async () => {
  const versions = ['202611010001', '202611020001']
  let checked: string[] = []
  const ready = new HealthService({ hasMigrations: async values => { checked = values; return true } }, async () => versions)
  assert.equal(await ready.isReady(), true)
  assert.deepEqual(checked, versions)
  assert.equal(await new HealthService({ hasMigrations: async () => false }, async () => versions).isReady(), false)
  assert.equal(await new HealthService({ hasMigrations: async () => { throw new Error('Credencial fictícia restrita') } }, async () => versions).isReady(), false)
  assert.equal(await new HealthService({ hasMigrations: async () => true }, async () => []).isReady(), false)
})

test('origem CORS exige uma origem exata e preserva configuração local ausente', () => {
  assert.equal(loadCorsOrigin({}), undefined)
  assert.equal(loadCorsOrigin({ CORS_ALLOWED_ORIGIN: 'https://aratu.example.test' }), 'https://aratu.example.test')
  for (const value of ['*', 'https://aratu.example.test/', 'https://aratu.example.test/path', 'file:///tmp', 'https://user:password@example.test']) {
    assert.throws(() => loadCorsOrigin({ CORS_ALLOWED_ORIGIN: value }), /CORS_ALLOWED_ORIGIN/)
  }
})

test('migrador não declara sucesso quando o pacote perdeu os arquivos SQL', async () => {
  await assert.rejects(new DatabaseMigrator('/diretorio-ficticio-inexistente/migrations').loadFiles(), /não encontrado/)
})
