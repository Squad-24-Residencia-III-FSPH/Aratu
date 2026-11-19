import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement, useState } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { sessionFor } from './fixtures.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-triage-'))
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node }, DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot }, MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, render, screen, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  cacheDir: viteCacheDir, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: WorkflowDialog }, { default: SvoTriagesPage }, { default: Sidebar }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/svoOccurrencesPage/SvoOccurrenceWorkflowDialog.tsx'),
  vite.ssrLoadModule('/src/pages/SvoTriagesPage.tsx'),
  vite.ssrLoadModule('/src/components/Sidebar.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])
const { MemoryRouter } = await import('react-router-dom')
afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  dom.window.close()
})

const occurrence = {
  id: '41', requesterType: 'HOSPITAL', location: 'Unidade de teste QA', status: 'PENDING',
  receivedAt: '2026-11-18T12:10:00.000Z', createdAt: '2026-11-18T12:10:00.000Z', revision: 1,
  requesterName: 'Solicitante ficticio QA', requesterPhone: '71999990000',
  description: 'Descricao sintetica QA', notes: null, attendantId: '7', triagedAt: null,
  triagedBy: null, updatedAt: '2026-11-18T12:10:00.000Z', evidenceDescription: 'Telefone',
}
const triage = {
  id: '81', occurrenceId: '41', revision: 1, supersedesId: null,
  deceasedName: null, estimatedAge: null, responsiblePhysician: null, crm: null,
  preliminaryCauseOfDeath: null, availableDocuments: null, referral: null, triageNotes: null,
  occurredAt: '2026-11-18T12:10:00.000Z', registeredAt: '2026-11-18T12:10:00.000Z', registeredBy: '7', reason: '',
}

function Harness({ onSave, onConfirm, initialTriage = null }) {
  const [current, setCurrent] = useState(initialTriage)
  return createElement(WorkflowDialog, {
    open: true,
    detail: { id: '41', data: occurrence, loading: false, error: '', triage: current, triageLoading: false, triageLoadError: '', triageError: '' },
    canWrite: true, savingTriage: false, confirming: false, confirmationError: '', confirmationBlocked: false,
    onClose() {}, onRetry() {}, onSaveTriage: async (input) => { onSave(input); setCurrent(triage); return triage },
    onConfirm: async (...args) => { onConfirm(...args); return { id: '41', status: 'CONFIRMED' } }, onClearConfirmationError() {},
  })
}

test('mostra resumo dos dados recebidos, bloqueia confirmação sem triagem salva e opera por Enter', async () => {
  const saves = []
  const confirmations = []
  const user = userEvent.setup()
  render(createElement(Harness, { onSave: (input) => saves.push(input), onConfirm: (...args) => confirmations.push(args) }))
  const dialog = await screen.findByRole('dialog')
  assert.ok(within(dialog).getByText(/Solicitante fict/))
  assert.ok(within(dialog).getByText('Descricao sintetica QA'))
  await user.click(within(dialog).getByRole('button', { name: 'Continuar para triagem' }))
  const deceasedName = within(dialog).getByRole('textbox', { name: 'Nome do Falecido' })
  assert.equal(document.activeElement, deceasedName)
  await user.type(deceasedName, 'Pessoa QA{Enter}')
  assert.equal(saves.length, 1)
  assert.equal(saves[0].deceasedName, 'Pessoa QA')
  assert.ok(within(dialog).getByText(/Triagem cl.*vers.*1/))
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar dados recebidos' }))
  const confirmation = await screen.findAllByRole('dialog')
  await user.click(within(confirmation.at(-1)).getByRole('button', { name: 'Confirmar solicitação' }))
  assert.equal(confirmations.length, 1)
  assert.ok(await screen.findByText(/Solicita.*confirmada/))
  assert.ok(screen.getByText(/dispon.*US18/))
})

test('exige justificativa para retificar uma triagem existente e envia nova versão', async () => {
  const saves = []
  const user = userEvent.setup()
  render(createElement(Harness, { initialTriage: triage, onSave: (input) => saves.push(input), onConfirm() {} }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Continuar para triagem' }))
  await user.click(within(dialog).getByRole('button', { name: /Salvar retifica.*continuar/ }))
  assert.equal(saves.length, 0)
  assert.ok(within(dialog).getByText('Informe a justificativa para retificar a triagem.'))
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa da retificação' }), 'Ajuste QA{Enter}')
  assert.equal(saves.length, 1)
  assert.equal(saves[0].reason, 'Ajuste QA')
})

test('a caixa de triagens consulta somente pendentes e abre o fluxo existente', async () => {
  const calls = []
  const api = async (path) => {
    calls.push(path)
    if (path === '/svo/occurrences?status=PENDING') return new Response(JSON.stringify([{
      id: '41', requesterType: 'HOSPITAL', location: 'Unidade de teste QA', status: 'PENDING',
      receivedAt: '2026-11-18T12:10:00.000Z', createdAt: '2026-11-18T12:10:00.000Z', revision: 1,
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (path === '/svo/occurrences/41') return new Response(JSON.stringify(occurrence), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (path === '/svo/occurrences/41/triage') return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ erro: 'Rota inesperada.' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }
  const auth = { session: sessionFor('ATENDENTE_SVO'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  render(createElement(AuthContext.Provider, { value: auth }, createElement(SvoTriagesPage)))
  assert.ok(await screen.findByRole('button', { name: 'Abrir triagem da solicitação 41' }))
  assert.ok(calls.includes('/svo/occurrences?status=PENDING'))
  await user.click(screen.getByRole('button', { name: 'Abrir triagem da solicitação 41' }))
  assert.ok(await screen.findByRole('heading', { name: 'Triagem — Solicitação #41' }))
  assert.ok(screen.getByText('Dados Recebidos — Solicitação #41'))
  assert.equal(screen.queryByRole('dialog'), null)
  assert.ok(calls.includes('/svo/occurrences/41'))
  assert.ok(calls.includes('/svo/occurrences/41/triage'))
})

test('a página completa abre com os dados de uma triagem existente para retificação', async () => {
  const savedTriage = { ...triage, deceasedName: 'Pessoa fictícia QA', referral: 'Encaminhamento QA' }
  const api = async (path) => {
    if (path === '/svo/occurrences?status=PENDING') return new Response(JSON.stringify([{
      id: '41', requesterType: 'HOSPITAL', location: 'Unidade de teste QA', status: 'PENDING',
      receivedAt: '2026-11-18T12:10:00.000Z', createdAt: '2026-11-18T12:10:00.000Z', revision: 1,
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (path === '/svo/occurrences/41') return new Response(JSON.stringify(occurrence), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (path === '/svo/occurrences/41/triage') return new Response(JSON.stringify(savedTriage), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({ erro: 'Rota inesperada.' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }
  const auth = { session: sessionFor('ATENDENTE_SVO'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  render(createElement(AuthContext.Provider, { value: auth }, createElement(SvoTriagesPage)))
  await user.click(await screen.findByRole('button', { name: 'Abrir triagem da solicitação 41' }))
  assert.ok(await screen.findByRole('heading', { name: 'Triagem — Solicitação #41' }))
  assert.equal(screen.queryByRole('dialog'), null)
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  assert.equal(screen.getByRole('textbox', { name: 'Nome do Falecido' }).value, 'Pessoa fictícia QA')
  assert.equal(screen.getByRole('textbox', { name: 'Encaminhamento' }).value, 'Encaminhamento QA')
  assert.ok(screen.getByRole('textbox', { name: 'Justificativa da retificação' }))
})

test('o Sidebar renderiza Triagens como link para ATENDENTE_SVO', () => {
  const auth = { session: sessionFor('ATENDENTE_SVO'), signIn: async () => {}, logout() {}, api: async () => new Response('[]'), notice: '' }
  render(createElement(MemoryRouter, { initialEntries: ['/svo/solicitacoes'] },
    createElement(AuthContext.Provider, { value: auth }, createElement(Sidebar))))
  const link = screen.getByRole('link', { name: 'Triagens' })
  assert.equal(link.getAttribute('href'), '/svo/triagens')
})
