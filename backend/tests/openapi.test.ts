import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'

const SPEC_PATH = path.resolve(__dirname, '..', 'docs', 'openapi.yaml')
const spec = parse(readFileSync(SPEC_PATH, 'utf8')) as Record<string, unknown>

const EXPECTED_OPERATIONS: ReadonlyArray<readonly [string, string]> = [
  ['/', 'get'],
  ['/auth/login', 'post'],
  ['/auth/logout', 'post'],
  ['/profiles', 'get'],
  ['/vehicles', 'get'],
  ['/vehicles', 'post'],
  ['/vehicles/{id}', 'get'],
  ['/vehicles/{id}', 'put'],
  ['/vehicles/{id}/status', 'patch'],
]

function getByPath(value: unknown, segments: readonly string[]): unknown {
  let current = value
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function collectRefs(value: unknown, refs = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs)
    return refs
  }
  if (typeof value !== 'object' || value === null) return refs
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === '$ref' && typeof entry === 'string') refs.add(entry)
    else collectRefs(entry, refs)
  }
  return refs
}

test('contrato OpenAPI declara versão, título e servidor de desenvolvimento', () => {
  assert.equal(spec.openapi, '3.0.3')
  assert.equal(getByPath(spec, ['info', 'title']), 'Aratu API')
  assert.equal(typeof getByPath(spec, ['info', 'version']), 'string')
  assert.deepEqual(getByPath(spec, ['servers', '0', 'url']), 'http://localhost:3000')
})

test('contrato cobre todas as operações expostas pelo backend', () => {
  for (const [route, method] of EXPECTED_OPERATIONS) {
    const operation = getByPath(spec, ['paths', route, method])
    assert.equal(typeof operation, 'object', `Operação ausente: ${method.toUpperCase()} ${route}`)
    assert.notEqual(operation, null, `Operação ausente: ${method.toUpperCase()} ${route}`)
  }
})

test('cada operação possui identificador único, resumo, tags e respostas', () => {
  const operationIds = new Set<string>()

  for (const [route, method] of EXPECTED_OPERATIONS) {
    const operation = getByPath(spec, ['paths', route, method]) as Record<string, unknown> | undefined
    assert.ok(operation, `Operação ausente: ${method.toUpperCase()} ${route}`)

    const operationId = operation.operationId
    assert.equal(typeof operationId, 'string', `operationId ausente em ${method.toUpperCase()} ${route}`)
    assert.equal(operationIds.has(String(operationId)), false, `operationId duplicado: ${operationId}`)
    operationIds.add(String(operationId))

    assert.equal(typeof operation.summary, 'string')
    assert.ok(Array.isArray(operation.tags) && operation.tags.length > 0)
    assert.equal(typeof operation.responses, 'object')
    assert.ok(Object.keys(operation.responses as Record<string, unknown>).length > 0)
  }
})

test('todas as referências locais do contrato são resolvidas', () => {
  for (const ref of collectRefs(spec)) {
    assert.ok(ref.startsWith('#/'), `Referência externa não suportada: ${ref}`)
    const target = getByPath(spec, ref.slice(2).split('/'))
    assert.notEqual(target, undefined, `Referência não resolvida: ${ref}`)
  }
})

test('segurança Bearer é global e login permanece público', () => {
  assert.equal(getByPath(spec, ['components', 'securitySchemes', 'bearerAuth', 'scheme']), 'bearer')
  assert.deepEqual(spec.security, [{ bearerAuth: [] }])
  assert.deepEqual(getByPath(spec, ['paths', '/auth/login', 'post', 'security']), [])
  assert.deepEqual(getByPath(spec, ['paths', '/', 'get', 'security']), [])
})

test('exemplos do contrato não expõem credenciais reais', () => {
  const serialized = JSON.stringify(spec)
  assert.equal(serialized.includes('replace-with'), false)
  assert.equal(serialized.includes('@aratu.fsph.se.gov.br'), false)
})
