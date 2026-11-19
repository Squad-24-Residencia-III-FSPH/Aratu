import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { closeAuthDom, testing, userEvent, vite } from './auth-dom.fixture.mjs'
import { sessionFor } from './fixtures.mjs'

const { cleanup, fireEvent, render, screen, within } = testing
const [{ default: FinesPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/FinesPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])
afterEach(cleanup)
after(closeAuthDom)

const vehicle = {
  id: '1', licensePlate: 'ABC1D23', brand: null, model: null, year: null, vehicleType: null,
  ownership: 'OWNED', categories: ['PASSENGER'], seats: 5, bodyLimit: 0, weightLimit: null,
  operationType: 'SVO', status: 'AVAILABLE', revision: 1,
}
const suggestion = { tripId: '12', driverId: '3', driverName: 'Motorista Fictício', startedAt: '2026-11-18T09:00:00Z' }

for (const confirmSuggestion of [false, true]) {
  test(`registra multa ${confirmSuggestion ? 'com a sugestão confirmada' : 'sem atribuir o motorista sugerido'}`, async () => {
    let fine
    const api = async (path, options) => {
      if (path === '/vehicles') return Response.json([vehicle])
      if (path === '/drivers') return Response.json([])
      if (path.startsWith('/fines/driver-suggestions?')) return Response.json({ items: [suggestion] })
      assert.equal(path, '/fines')
      if (options.method === 'POST') {
        fine = {
          ...JSON.parse(options.body), id: '2', status: 'PENDING', revision: 1, vehicle,
          driver: confirmSuggestion ? { name: suggestion.driverName } : null,
        }
        return Response.json(fine, { status: 201 })
      }
      return Response.json({ items: fine ? [fine] : [] })
    }

    render(createElement(AuthContext.Provider, { value: { api, session: sessionFor('GESTOR') } }, createElement(FinesPage)))
    const user = userEvent.setup()
    await screen.findByText('Nenhuma multa registrada.')
    await user.click(screen.getByRole('button', { name: 'Registrar multa' }))
    const form = within(screen.getByRole('dialog', { name: 'Registrar multa' }))
    await user.click(form.getByRole('combobox', { name: /Veículo/ }))
    await user.click(await screen.findByRole('option', { name: vehicle.licensePlate }))
    const fill = (label, value) => fireEvent.change(form.getByLabelText(label), { target: { value } })
    fill(/Data e hora da infração/, '2026-11-18T09:30')
    const suggestedDriver = await form.findByRole('combobox', { name: 'Motorista sugerido pela viagem' })
    if (confirmSuggestion) {
      await user.click(suggestedDriver)
      await user.click(await screen.findByRole('option', { name: /Motorista Fictício/ }))
    }
    fill(/Código da infração/, 'TESTE')
    fill(/Descrição da infração/, 'Infração fictícia')
    fill(/Valor/, '150,75')
    fill(/Origem da informação/, 'Setor de teste')
    fill(/Justificativa do registro/, 'Registro')
    fill(/Descrição da evidência/, 'Notificação fictícia')
    await user.click(form.getByRole('button', { name: 'Registrar multa' }))
    assert.ok(await screen.findByText('Multa registrada com sucesso.'))
    assert.equal(fine.driverId, confirmSuggestion ? suggestion.driverId : null)
    assert.equal(fine.tripId, confirmSuggestion ? suggestion.tripId : null)
    assert.equal(fine.amount, '150.75')
    assert.ok(await screen.findByText(confirmSuggestion ? suggestion.driverName : 'Sem motorista'))
  })
}
