import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = fileURLToPath(new URL('../', import.meta.url))

test('gate TAP rejeita skips, ausência de resumo e suíte vazia', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'aratu-delivery-test-'))
  try {
    for (const { total, skipped, expected } of [
      { total: 4, skipped: 0, expected: 0 }, { total: 4, skipped: 1, expected: 1 }, { total: 0, skipped: 0, expected: 1 },
    ]) {
      const path = join(temporary, 'report.tap')
      writeFileSync(path, `# tests ${total}\n# pass ${total - skipped}\n# fail 0\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`)
      const result = spawnSync(process.execPath, [join(scripts, 'check-test-report.mjs'), path], { encoding: 'utf8', env: { PATH: process.env.PATH } })
      assert.equal(result.status, expected, result.stderr)
    }
    const incomplete = join(temporary, 'incomplete.tap')
    writeFileSync(incomplete, 'TAP version 13\n')
    assert.equal(spawnSync(process.execPath, [join(scripts, 'check-test-report.mjs'), incomplete]).status, 1)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
})

test('configuração exige URL direta TLS e não expõe URL secreta inválida', () => {
  const env = { PATH: process.env.PATH,
    NEON_DATABASE_URL: 'postgresql://test:synthetic@example.neon.tech/neondb?sslmode=require',
    RENDER_API_KEY: 'synthetic', RENDER_SERVICE_ID: 'srv-synthetic',
    CLOUDFLARE_API_TOKEN: 'synthetic', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    CLOUDFLARE_PAGES_PROJECT: 'aratu-test', API_BASE_URL: 'https://api.example.test', FRONTEND_URL: 'https://ui.example.test',
  }
  const run = overrides => spawnSync(process.execPath, [join(scripts, 'validate-deployment.mjs')], { env: { ...env, ...overrides }, encoding: 'utf8' })
  assert.equal(run({}).status, 0)
  assert.equal(run({ NEON_DATABASE_URL: 'postgresql://test:synthetic@example-pooler.neon.tech/neondb?sslmode=require' }).status, 1)
  assert.equal(run({ NEON_DATABASE_URL: 'postgresql://test:synthetic@example.neon.tech/neondb' }).status, 1)
  const secret = 'segredo-ficticio-nao-exibir'
  const invalid = run({ NEON_DATABASE_URL: secret })
  assert.equal(invalid.status, 1)
  assert.doesNotMatch(invalid.stderr, new RegExp(secret))
  assert.equal(run({ BOOTSTRAP_DEMO: 'true' }).status, 1)
})
