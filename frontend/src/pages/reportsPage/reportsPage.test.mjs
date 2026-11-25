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
import { sessionFor } from '../../../tests/fixtures.mjs'
import { catalog, preview, report } from '../../../tests/reports.fixture.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-reports-l19-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  Event: { configurable: true, value: dom.window.Event },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
})
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = id => clearTimeout(id)

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const frontendRoot = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: frontendRoot,
  cacheDir: viteCacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
const [
  { default: ReportsPage },
  { AuthContext },
  helpers,
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/reportsPage/ReportsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/pages/reportsPage/reportHelpers.ts'),
])

const reportWithPlateFilter = {
  ...report,
  filters: [
    ...report.filters,
    { key: 'licensePlatePrefix', label: 'Prefixo da placa', type: 'text', placeholder: 'Ex.: QAF' },
  ],
}
const catalogWithPlateFilter = [{ module: 'FROTA', reports: [reportWithPlateFilter] }]

afterEach(() => {
  cleanup()
  dom.window.localStorage.clear()
})
after(async () => {
  await vite.close()
  dom.window.close()
})

function mount(api, profile = 'GESTOR') {
  render(createElement(AuthContext.Provider, {
    value: { session: sessionFor(profile), api, notice: '', logout() {}, signIn: async () => {} },
  }, createElement(ReportsPage)))
  return userEvent.setup()
}

function projectedPreview(requestPath) {
  const keys = new URL('http://test' + requestPath).searchParams.get('columns').split(',')
  return {
    ...preview,
    columns: keys.map(key => reportWithPlateFilter.columns.find(column => column.key === key)).filter(Boolean),
    rows: preview.rows.map(row => Object.fromEntries(keys.map(key => [key, row[key]]))),
    totals: Object.fromEntries(Object.entries(preview.totals).filter(([key]) => keys.includes(key))),
  }
}

test('helpers preservam ordem de colunas na assinatura e validam campos isolados', () => {
  const sigA = helpers.buildReportSelectionSignature('fleet-fuelings', {
    from: '2026-11-01',
    to: '2026-11-15',
    columns: ['licensePlate', 'liters'],
    filters: { fuelType: 'DIESEL' },
  })
  const sigB = helpers.buildReportSelectionSignature('fleet-fuelings', {
    from: '2026-11-01',
    to: '2026-11-15',
    columns: ['liters', 'licensePlate'],
    filters: { fuelType: 'DIESEL' },
  })
  assert.notEqual(sigA, sigB)
  const missingTo = helpers.validateReportSelection(reportWithPlateFilter, {
    from: '2026-11-01',
    to: '',
    columns: ['licensePlate'],
    filters: {},
  })
  assert.equal(missingTo.from, undefined)
  assert.match(missingTo.to, /data final/i)
  assert.equal(missingTo.firstInvalid, 'to')
})

test('T24-P03/T25-P04: exige prévia conferida e invalida ao alterar data, filtro ou ordem de colunas', async () => {
  let exportCalls = 0
  const user = mount(async requestPath => {
    if (requestPath === '/reports/catalog') return Response.json(catalogWithPlateFilter)
    if (requestPath.includes('/export')) exportCalls++
    return Response.json(projectedPreview(requestPath))
  })

  const csvBtn = await screen.findByRole('button', { name: 'Exportar CSV' })
  const printBtn = screen.getByRole('button', { name: 'Imprimir relatório' })
  assert.equal(csvBtn.disabled, true)
  assert.equal(printBtn.disabled, true)
  assert.ok(screen.getByText(/Conferência obrigatória antes de exportar/))

  await user.click(screen.getByRole('button', { name: 'Gerar prévia' }))
  await screen.findByText('QAF1A32')
  assert.equal(csvBtn.disabled, false)
  assert.equal(printBtn.disabled, false)

  // Alterar data invalida a prévia e exige nova conferência.
  const toInput = screen.getByLabelText(/Data final/i)
  fireEvent.change(toInput, { target: { value: '2026-11-20' } })
  assert.equal(csvBtn.disabled, true)
  assert.equal(printBtn.disabled, true)
  assert.equal(screen.queryByText('QAF1A32'), null)
  assert.ok(screen.getByText(/Critérios alterados após a última prévia/))
  assert.ok(screen.getByRole('button', { name: 'Gerar nova prévia' }))
  assert.equal(exportCalls, 0)

  await user.click(screen.getByRole('button', { name: 'Gerar nova prévia' }))
  await screen.findByText('QAF1A32')
  assert.equal(csvBtn.disabled, false)

  // Alterar filtro invalida a conferência.
  await user.type(screen.getByLabelText(/Prefixo da placa/i), 'QAF')
  assert.equal(csvBtn.disabled, true)
  assert.equal(printBtn.disabled, true)

  await user.click(screen.getByRole('button', { name: 'Gerar nova prévia' }))
  await screen.findByText('QAF1A32')
  assert.equal(csvBtn.disabled, false)

  // Alterar a ordem das colunas (desmarcar e remarcar Litros) também invalida a conferência.
  await user.click(screen.getByRole('checkbox', { name: 'Litros' }))
  await user.click(screen.getByRole('checkbox', { name: 'Litros' }))
  assert.equal(csvBtn.disabled, true)
  assert.equal(printBtn.disabled, true)
})

test('T24-P02/T24-P04: cabeçalho da prévia exibe filtros, emissor e fuso; totais anunciados uma única vez', async () => {
  const user = mount(async requestPath => {
    if (requestPath === '/reports/catalog') return Response.json(catalogWithPlateFilter)
    return Response.json(projectedPreview(requestPath))
  })

  await user.click(await screen.findByRole('combobox', { name: 'Combustível', exact: true }))
  await user.click(screen.getByRole('option', { name: 'Diesel', exact: true }))
  await user.type(screen.getByLabelText(/Prefixo da placa/i), 'tqa5v23')
  await user.click(screen.getByRole('button', { name: 'Gerar prévia' }))

  const headerSection = await screen.findByRole('region', { name: 'Cabeçalho do relatório conferido' })
  assert.ok(within(headerSection).getByRole('heading', { name: 'Abastecimentos por período' }))
  assert.ok(within(headerSection).getByText(/Combustível: Diesel/))
  assert.ok(within(headerSection).getByText(/Prefixo da placa: TQA5V23/))
  assert.ok(within(headerSection).getByText(/Pessoa de teste/))
  assert.ok(within(headerSection).getByText(/America\/Maceio, UTC-03:00/))

  // T24-P04: apenas uma região role="status" anuncia a contagem e os totalizadores.
  const statusRegionsWithTotals = screen.getAllByRole('status').filter(node => node.textContent.includes('Litros — total:'))
  assert.equal(statusRegionsWithTotals.length, 1)
  assert.ok(document.querySelector('tfoot'))
})

test('T24-P05: associa erros diretamente à data final, datas invertidas, prefixo e foca o primeiro inválido', async () => {
  const user = mount(async requestPath => {
    if (requestPath === '/reports/catalog') return Response.json(catalogWithPlateFilter)
    return Response.json({ erro: 'Informe um valor válido para o filtro Prefixo da placa.', code: 'INVALID_FILTER' }, { status: 400 })
  })

  const fromInput = await screen.findByLabelText(/Data inicial/i)
  const toInput = screen.getByLabelText(/Data final/i)
  const generateBtn = screen.getByRole('button', { name: 'Gerar prévia' })

  // Limpar somente a data final associa erro em Data final (com aria-invalid e aria-describedby) e foca nela no envio.
  fireEvent.change(toInput, { target: { value: '' } })
  assert.equal(toInput.getAttribute('aria-invalid'), 'true')
  assert.ok(toInput.getAttribute('aria-describedby'))
  assert.equal(fromInput.getAttribute('aria-invalid'), null)
  await user.click(generateBtn)
  assert.equal(document.activeElement, toInput)

  // Inverter datas associa erro às duas datas e foca em Data inicial no envio.
  fireEvent.change(fromInput, { target: { value: '2026-11-20' } })
  fireEvent.change(toInput, { target: { value: '2026-11-10' } })
  assert.equal(fromInput.getAttribute('aria-invalid'), 'true')
  assert.equal(toInput.getAttribute('aria-invalid'), 'true')
  await user.click(generateBtn)
  assert.equal(document.activeElement, fromInput)

  // Corrigir datas e digitar pontuação no prefixo associa erro ao campo de prefixo e foca nele.
  fireEvent.change(fromInput, { target: { value: '2026-11-01' } })
  fireEvent.change(toInput, { target: { value: '2026-11-15' } })
  const plateInput = screen.getByLabelText(/Prefixo da placa/i)
  await user.type(plateInput, 'TQA-5V')
  assert.equal(plateInput.getAttribute('aria-invalid'), 'true')
  await user.click(generateBtn)
  assert.equal(document.activeElement, plateInput)

  // Erro 400 da API também se associa ao filtro e foca nele.
  await user.clear(plateInput)
  await user.type(plateInput, 'TQA5V23')
  await user.click(generateBtn)
  await waitFor(() => assert.equal(plateInput.getAttribute('aria-invalid'), 'true'))
  assert.equal(document.activeElement, plateInput)
})

test('T25-P01/P02/P03/P05: impressão traz identificação repetida, fuso, valores sem quebra e restaura foco após afterprint/Esc', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    licensePlate: `QAF1A${String(index).padStart(2, '0')}`,
    liters: '26.375',
    totalValue: '1082.20',
  }))
  const multiRowPrint = {
    ...preview,
    rows,
    totalCount: rows.length,
    totals: { liters: '316.500', totalValue: '12986.40' },
    generatedAt: '2026-11-23T15:20:22.765Z',
    generatedBy: { id: '2', name: 'Gestor Fictício QA', role: 'GESTOR' },
    appliedFilters: [{ label: 'Combustível', value: 'Diesel' }],
  }

  let articleSeen = null
  dom.window.print = () => {
    articleSeen = document.querySelector('article')
    assert.ok(articleSeen)
    const banner = articleSeen.querySelector('header')
    assert.ok(banner.textContent.includes('Fundação de Saúde Parreiras Horta'))
    assert.ok(banner.textContent.includes('Abastecimentos por período'))
    assert.ok(banner.textContent.includes('America/Maceio, UTC-03:00'))
    assert.ok(banner.textContent.includes('Gestor Fictício QA'))
    assert.ok(articleSeen.textContent.includes('R$\u00a012.986,40'))
    // Simula cancelamento/fechamento pelo navegador (Esc -> afterprint) movendo foco para BODY antes do evento.
    dom.window.document.body.focus()
    dom.window.dispatchEvent(new dom.window.Event('afterprint'))
  }

  const user = mount(async requestPath => {
    if (requestPath === '/reports/catalog') return Response.json(catalog)
    if (requestPath.includes('format=print')) return Response.json(multiRowPrint)
    return Response.json({ ...preview, rows: rows.slice(0, 2), totalCount: rows.length, totals: multiRowPrint.totals })
  })

  await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }))
  await screen.findByText('QAF1A00')

  const printBtn = screen.getByRole('button', { name: 'Imprimir relatório' })
  printBtn.focus()
  await user.click(printBtn)

  await waitFor(() => assert.ok(articleSeen !== null))
  await waitFor(() => assert.equal(document.querySelector('article'), null))
  await waitFor(() => assert.equal(document.activeElement, printBtn))

  // Texto fiel ao que o navegador demonstra: nunca afirma ter salvado PDF ou imprimido.
  assert.ok(await screen.findByText(/Diálogo de impressão fechado\. A gravação em PDF ou impressão depende da confirmação no navegador\./))
  assert.equal(screen.queryByText(/PDF salvo/i), null)

  // Verifica regras CSS de impressão multipágina e proteção contra quebra dentro de moeda/números.
  const cssContent = fs.readFileSync(path.join(frontendRoot, 'src/pages/reportsPage/ReportsPage.module.css'), 'utf-8')
  assert.match(cssContent, /display:\s*table-header-group/)
  assert.match(cssContent, /table-layout:\s*auto/)
  assert.match(cssContent, /white-space:\s*nowrap/)
  assert.match(cssContent, /break-inside:\s*avoid/)
  assert.equal(/overflow-wrap:\s*anywhere/.test(cssContent), false)
})
