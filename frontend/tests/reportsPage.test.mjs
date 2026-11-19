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
import { sessionFor } from './fixtures.mjs'
import { catalog, preview, report } from './reports.fixture.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-reports-test-'))
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node }, DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot }, MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = id => clearTimeout(id)
const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), cacheDir: viteCacheDir, plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: ReportsPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/reportsPage/ReportsPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])
afterEach(() => { cleanup(); dom.window.localStorage.clear() })
after(async () => { await vite.close(); dom.window.close() })

function mount(api, profile = 'GESTOR') {
  render(createElement(AuthContext.Provider, { value: { session: sessionFor(profile), api, notice: '', logout() {}, signIn: async () => {} } }, createElement(ReportsPage)))
  return userEvent.setup()
}
function projectedPreview(path) {
  const keys = new URL('http://test' + path).searchParams.get('columns').split(',')
  return { ...preview, columns: preview.columns.filter(column => keys.includes(column.key)),
    rows: preview.rows.map(row => Object.fromEntries(keys.map(key => [key, row[key]]))), totals: Object.fromEntries(Object.entries(preview.totals).filter(([key]) => keys.includes(key))) }
}
test('liga/desliga colunas, persiste seleção, envia projeção e mostra totais globais acessíveis', async () => {
  let query = ''
  const user = mount(async path => {
    if (path === '/reports/catalog') return Response.json(catalog)
    query = path; return Response.json(projectedPreview(path))
  })
  const generate = await screen.findByRole('button', { name: 'Gerar prévia' })
  assert.equal(document.title, 'Relatórios Operacionais — Aratu')
  assert.ok(screen.getByRole('group', { name: 'Colunas visíveis no relatório' }))
  await user.click(screen.getByRole('checkbox', { name: 'Valor total' }))
  await user.click(generate)
  assert.ok(await screen.findByRole('columnheader', { name: 'Litros' }))
  assert.equal(screen.queryByRole('columnheader', { name: 'Valor total' }), null)
  assert.equal(new URL('http://test' + query).searchParams.get('columns'), 'licensePlate,liters')
  assert.ok(screen.getAllByText(/Litros — total: 12,5/).length > 0)
  assert.ok(document.querySelector('tfoot'))
  assert.equal(document.querySelector('table caption').textContent.includes('Abastecimentos'), true)
  assert.ok(Object.values(dom.window.localStorage).some(text => JSON.parse(text).columns.join(',') === 'licensePlate,liters'))
  await user.click(screen.getByRole('checkbox', { name: 'Litros' }))
  await user.click(screen.getByRole('checkbox', { name: 'Placa' }))
  assert.equal(generate.disabled, true)
  assert.ok(screen.getByRole('alert').textContent.includes('Selecione ao menos uma coluna'))
  await user.click(screen.getByRole('button', { name: 'Restaurar padrão' }))
  assert.equal(generate.disabled, false)
})
test('carregando, vazio e recuperação de erro mantêm mensagens operacionais', async () => {
  let resolveCatalog
  let fail = true
  const user = mount(async path => {
    if (path === '/reports/catalog') return new Promise(resolve => { resolveCatalog = resolve })
    return fail ? Response.json({ erro: 'Falha fictícia. Tente novamente.' }, { status: 500 }) : Response.json({ ...preview, rows: [], totalCount: 0, totalPages: 0 })
  })
  assert.ok(screen.getByRole('status').getAttribute('aria-busy') === 'true')
  resolveCatalog(Response.json(catalog))
  await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }))
  assert.ok(await screen.findByRole('button', { name: 'Tentar novamente' }))
  fail = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhum registro encontrado para o período e os filtros selecionados.'))
})
test('falha ao imprimir preserva prévia e anuncia estado parcial', async () => {
  const user = mount(async path => path === '/reports/catalog' ? Response.json(catalog)
    : path.includes('/preview') ? Response.json(projectedPreview(path)) : Response.json({ erro: 'A impressão em tela suporta até 2.000 registros. Utilize CSV.' }, { status: 422 }))
  await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }))
  assert.ok(await screen.findByText('QAF1A32'))
  await user.click(screen.getByRole('button', { name: 'Imprimir relatório' }))
  assert.ok(await screen.findByText(/A impressão em tela suporta/))
  assert.ok(screen.getByText('QAF1A32'))
})
test('impressão aguarda renderização do resultado completo com emissor e colunas selecionadas', async () => {
  let printed = false
  dom.window.print = () => {
    const article = document.querySelector('article')
    assert.ok(article.textContent.includes('Fundação de Saúde Parreiras Horta'))
    assert.ok(article.textContent.includes('Gestor Fictício QA'))
    assert.equal(within(article).getAllByRole('row').length, 3)
    printed = true
  }
  const user = mount(async path => path === '/reports/catalog' ? Response.json(catalog) : Response.json({ ...preview,
    generatedAt: '2026-11-16T12:00:00Z', generatedBy: { id: '1', name: 'Gestor Fictício QA', role: 'GESTOR' }, appliedFilters: [{ label: 'Combustível', value: 'Diesel' }] }))
  await user.click(await screen.findByRole('button', { name: 'Imprimir relatório' }))
  await waitFor(() => assert.equal(printed, true))
  await waitFor(() => assert.equal(document.querySelector('article'), null))
})
test('resposta antiga de prévia é descartada depois de desmontar a tela', async () => {
  let resolvePreview
  const extra = { ...report, key: 'drivers-roster', module: 'MOTORISTAS', title: 'Motoristas' }
  const user = mount(async path => path === '/reports/catalog' ? Response.json([...catalog, { module: 'MOTORISTAS', reports: [extra] }]) : new Promise(resolve => { resolvePreview = resolve }))
  await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }))
  assert.ok(screen.getByText('Carregando dados do relatório...'))
  // Desmontar a página invalida a requisição, inclusive quando o transporte ignora AbortSignal.
  cleanup()
  resolvePreview(Response.json(preview))
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(screen.queryByText('QAF1A32'), null)
})
test('seleção de módulo troca o relatório e seus filtros sem reaproveitar uma prévia anterior', async () => {
  const drivers = { ...report, key: 'drivers-roster', module: 'MOTORISTAS', title: 'Motoristas', filters: [], period: { ...report.period, required: false } }
  const user = mount(async path => path === '/reports/catalog'
    ? Response.json([...catalog, { module: 'MOTORISTAS', reports: [drivers] }]) : Response.json(projectedPreview(path)))
  await user.click(await screen.findByRole('button', { name: 'Gerar prévia' }))
  assert.ok(await screen.findByText('QAF1A32'))
  await user.click(screen.getByRole('combobox', { name: 'Módulo', exact: true }))
  await user.click(screen.getByRole('option', { name: 'Motoristas', exact: true }))
  assert.equal(screen.getByRole('combobox', { name: 'Tipo de relatório', exact: true }).textContent, 'Motoristas')
  assert.equal(screen.queryByText('QAF1A32'), null)
  assert.equal(screen.queryByRole('combobox', { name: 'Combustível', exact: true }), null)
})
test('falha no catálogo tem recuperação e perfil sem acesso não consulta dados', async () => {
  let calls = 0
  const user = mount(async () => { calls++; return calls === 1 ? Response.json({ erro: 'Catálogo indisponível.' }, { status: 503 }) : Response.json(catalog) })
  await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByRole('button', { name: 'Gerar prévia' }))
  cleanup()
  mount(async () => { throw new Error('Não deve consultar a API') }, 'MOTORISTA')
  assert.ok(screen.getByText('Seu perfil não tem permissão para gerar relatórios.'))
})
