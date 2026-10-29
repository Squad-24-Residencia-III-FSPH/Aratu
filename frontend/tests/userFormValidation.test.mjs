import test from 'node:test'
import assert from 'node:assert/strict'
import { validateUserForm } from '../src/users/userFormValidation.ts'

test('user form requires name, email, password and profile', () => {
  assert.deepEqual(validateUserForm({
    name: ' ',
    email: '',
    password: '',
    roleId: '',
  }), {
    name: 'Informe o nome do usuário.',
    email: 'Informe o e-mail institucional.',
    password: 'Informe uma senha inicial.',
    roleId: 'Selecione um perfil de acesso.',
  })
})

test('user form rejects malformed emails and passwords over 72 UTF-8 bytes', () => {
  const errors = validateUserForm({
    name: 'Usuário Sintético',
    email: 'email-inválido',
    password: 'á'.repeat(37),
    roleId: '1',
  })

  assert.equal(errors.email, 'Informe um e-mail válido.')
  assert.equal(errors.password, 'A senha excede o limite de 72 bytes suportado pelo sistema.')
})

test('user form accepts a password at the backend bcrypt byte limit', () => {
  assert.deepEqual(validateUserForm({
    name: 'Usuário Sintético',
    email: 'usuario@example.test',
    password: 'a'.repeat(72),
    roleId: '1',
  }), {})
})
