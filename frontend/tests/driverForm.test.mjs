import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const form = await vite.ssrLoadModule('/src/drivers/driverForm.ts')
test.after(() => vite.close())

test('mascara CPF e mantém payload somente com dígitos', () => {
  assert.equal(form.maskCpf('12345678901'), '123.456.789-01')
  assert.equal(form.cpfDigits('123.456.789-01'), '12345678901')
})

test('considera CNH válida no próprio dia e alerta até 30 dias', () => {
  assert.equal(form.cnhValidity('2026-05-10', '2026-05-11'), 'expired')
  assert.equal(form.cnhValidity('2026-05-11', '2026-05-11'), 'upcoming')
  assert.equal(form.cnhValidity('2026-06-10', '2026-05-11'), 'upcoming')
  assert.equal(form.cnhValidity('2026-06-11', '2026-05-11'), 'valid')
  assert.equal(form.formatIsoDate('2026-05-11'), '11/05/2026')
})

test('valida campos obrigatórios sem impor regra nova de negócio', () => {
  const errors = form.validateDriverForm({ ...form.EMPTY_DRIVER_FORM, name: ' Pessoa ', cpf: '12345678901',
    cnhNumber: '123', cnhCategory: 'B', cnhExpiresAt: '2027-01-01', status: 'AWAY', reason: 'Registro' })
  assert.deepEqual(errors, {})
  assert.ok(form.validateDriverForm(form.EMPTY_DRIVER_FORM).cpf)
})
