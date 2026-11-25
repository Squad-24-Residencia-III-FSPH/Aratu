import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-occurrences-'))
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
const { default: OccurrenceDetailDialog } = await vite.ssrLoadModule('/src/pages/svoOccurrencesPage/SvoOccurrenceWorkflowDialog.tsx')
afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  dom.window.close()
})

const occurrence = {
  id: '41', requesterType: 'HOSPITAL', location: 'Unidade de teste QA', status: 'PENDING',
  receivedAt: '2026-11-18T12:10:00.000Z', createdAt: '2026-11-18T12:10:00.000Z', revision: 1,
  requesterName: 'Solicitante fictício QA', requesterPhone: '71999990000',
  description: 'Descrição sintética QA', notes: 'Observação fictícia QA', attendantId: '7',
  triagedAt: null, triagedBy: null, updatedAt: '2026-11-18T12:10:00.000Z', evidenceDescription: 'Telefone',
}

function renderDetail(data, onConfirm = async () => null) {
  return render(createElement(OccurrenceDetailDialog, {
    open: true,
    detail: { id: data.id, data, loading: false, error: '' },
    canWrite: true, confirming: false, confirmationError: '', confirmationBlocked: false,
    onClose() {}, onRetry() {}, onConfirm, onClearConfirmationError() {},
  }))
}

test('detalhes de solicitação confirmada permanecem visíveis sem liberar nova confirmação', async () => {
  renderDetail({ ...occurrence, status: 'CONFIRMED', revision: 2 })
  const dialog = await screen.findByRole('dialog', { name: 'Solicitação #41' })
  assert.ok(within(dialog).getByText('Solicitante fictício QA'))
  assert.ok(within(dialog).getByText('71999990000'))
  assert.ok(within(dialog).getByText('Descrição sintética QA'))
  assert.ok(within(dialog).getByText('Observação fictícia QA'))
  assert.ok(within(dialog).getByText(/não registra uma triagem clínica/i))
  assert.equal(within(dialog).queryByRole('button', { name: 'Confirmar dados recebidos' }), null)
})

test('ocorrência PENDING pode ser confirmada após revisar os dados sem etapa clínica', async () => {
  let confirmed = 0
  const user = userEvent.setup()
  renderDetail(occurrence, async (value) => { confirmed += 1; return value.id === occurrence.id })
  const details = await screen.findByRole('dialog', { name: 'Solicitação #41' })
  assert.ok(within(details).getByText('Solicitante fictício QA'))
  await user.click(within(details).getByRole('button', { name: 'Confirmar dados recebidos' }))
  const dialogs = await screen.findAllByRole('dialog')
  await user.click(within(dialogs.at(-1)).getByRole('button', { name: 'Confirmar solicitação' }))
  assert.equal(confirmed, 1)
  assert.ok(await screen.findByRole('dialog', { name: 'Solicitação #41' }))
})
