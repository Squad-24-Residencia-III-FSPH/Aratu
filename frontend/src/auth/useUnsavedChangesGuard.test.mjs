// Somente dados 100% fictícios (LGPD/SVO).
import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { dom, testing, vite, closeAuthDom } from '../../tests/auth-dom.fixture.mjs'

const { render, cleanup, act } = testing
const { hasFormChanges, useUnsavedChangesGuard } = await vite.ssrLoadModule('/src/auth/useUnsavedChangesGuard.ts')

afterEach(cleanup)
after(closeAuthDom)

test('hasFormChanges detecta alterações entre estado inicial e atual', () => {
  assert.equal(hasFormChanges({ destino: 'Lacen', passageiros: 2 }, { destino: 'Lacen', passageiros: 2 }), false)
  assert.equal(hasFormChanges({ destino: 'HUSE', passageiros: 2 }, { destino: 'Lacen', passageiros: 2 }), true)
})

test('useUnsavedChangesGuard libera saída imediata quando limpo e confirma quando alterado', () => {
  let guard
  let discarded = 0
  let closed = 0

  function Harness({ isDirty }) {
    guard = useUnsavedChangesGuard({
      isDirty,
      onDiscard: () => { discarded += 1 },
    })
    return createElement('div', null, guard.confirmOpen ? 'ABERTO' : 'FECHADO')
  }

  const view = render(createElement(Harness, { isDirty: false }))

  // Sem alterações: executa imediatamente e não bloqueia beforeunload.
  act(() => guard.requestDiscard(() => { closed += 1 }))
  assert.equal(closed, 1)
  assert.equal(guard.confirmOpen, false)
  const cleanUnload = new dom.window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(cleanUnload)
  assert.equal(cleanUnload.defaultPrevented, false)

  // Com alterações: abre diálogo acessível e ativa beforeunload.
  view.rerender(createElement(Harness, { isDirty: true }))
  const dirtyUnload = new dom.window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(dirtyUnload)
  assert.equal(dirtyUnload.defaultPrevented, true)

  act(() => guard.requestDiscard(() => { closed += 1 }))
  assert.equal(closed, 1)
  assert.equal(guard.confirmOpen, true)
  assert.equal(guard.dialogProps.confirmLabel, 'Descartar alterações')
  assert.equal(guard.dialogProps.cancelLabel, 'Continuar editando')
  assert.equal(guard.dialogProps.danger, true)

  // Cancelar mantém formulário aberto e dados intactos.
  act(() => guard.dialogProps.onCancel())
  assert.equal(guard.confirmOpen, false)
  assert.equal(closed, 1)
  assert.equal(discarded, 0)

  // Confirmar executa onDiscard e ação pendente.
  act(() => guard.requestDiscard(() => { closed += 1 }))
  act(() => guard.dialogProps.onConfirm())
  assert.equal(guard.confirmOpen, false)
  assert.equal(discarded, 1)
  assert.equal(closed, 2)
})
