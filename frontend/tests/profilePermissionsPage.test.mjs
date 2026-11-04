import test from 'node:test'
import assert from 'node:assert/strict'
import { profileDialogReducer } from '../src/pages/profilePermissionsPage/profileDialogState.ts'
import { profileListReducer } from '../src/pages/profilePermissionsPage/profileListState.ts'

test('abrir o diálogo seleciona o perfil clicado', () => {
  assert.equal(profileDialogReducer(null, { type: 'open', profile: 'GESTOR' }), 'GESTOR')
})

test('fechar o diálogo remove o perfil selecionado', () => {
  assert.equal(profileDialogReducer('GESTOR', { type: 'close' }), null)
})

test('abrir outro perfil substitui a seleção atual', () => {
  assert.equal(profileDialogReducer('GESTOR', { type: 'open', profile: 'MOTORISTA' }), 'MOTORISTA')
})

test('lista de perfis distingue carregamento, vazio, sucesso, acesso negado e erro', () => {
  const initial = { status: 'loading' }
  assert.deepEqual(profileListReducer({ status: 'error' }, { type: 'loading' }), initial)
  assert.deepEqual(profileListReducer(initial, { type: 'loaded', profiles: [] }), { status: 'empty' })

  const profiles = [{ id: '1', profile: 'GESTOR', description: null }]
  assert.deepEqual(profileListReducer(initial, { type: 'loaded', profiles }), { status: 'success', profiles })
  assert.deepEqual(profileListReducer(initial, { type: 'failed', reason: 'forbidden' }), { status: 'forbidden' })
  assert.deepEqual(profileListReducer(initial, { type: 'failed', reason: 'unavailable' }), { status: 'error' })
})
