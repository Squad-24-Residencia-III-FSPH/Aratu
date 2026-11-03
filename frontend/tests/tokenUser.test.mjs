import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenUserId } from '../src/auth/token.ts'

function tokenWithPayload(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.assinatura`
}

test('tokenUserId extrai o identificador do payload sem validar a assinatura', () => {
  assert.equal(tokenUserId(tokenWithPayload({ id: '42' })), '42')
  assert.equal(tokenUserId(tokenWithPayload({ id: 42 })), '42')
})

test('tokenUserId rejeita token malformado ou sem identificador válido', () => {
  assert.equal(tokenUserId('invalido'), null)
  assert.equal(tokenUserId(tokenWithPayload({ id: '' })), null)
  assert.equal(tokenUserId(tokenWithPayload({ id: 0 })), null)
  assert.equal(tokenUserId(tokenWithPayload({ perfil: 'ADMINISTRADOR' })), null)
})
