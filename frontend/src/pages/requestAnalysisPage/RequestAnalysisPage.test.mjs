// Somente dados 100% fictícios (LGPD/SVO): nomes, unidades e serviços inventados.
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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-request-analysis-l13-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><head><title>Início — Aratu</title></head><body></body></html>', {
  url: 'http://localhost/',
})
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
  ...['HTMLElement', 'SVGElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let compactViewport = false
dom.window.matchMedia = () => ({
  matches: compactViewport,
  media: '(max-width:899.95px)',
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
})
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const { MemoryRouter, useLocation } = await import('react-router-dom')

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: rootDir,
  cacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  helpers,
  { default: RequestAnalysisPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/requestAnalysisPage/requestAnalysisHelpers.ts'),
  vite.ssrLoadModule('/src/pages/requestAnalysisPage/RequestAnalysisPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => {
  cleanup()
  compactViewport = false
  document.title = 'Início — Aratu'
})
after(async () => {
  await vite.close()
  dom.window.close()
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true })
  } catch {
    // No Windows, o cache temporário pode permanecer bloqueado por instantes após o vite.close().
  }
})

function makeRequest(overrides = {}) {
  return {
    id: '50',
    requesterId: '8',
    requesterName: 'Servidora Fictícia Alpha',
    serviceId: '5',
    serviceName: 'Transporte institucional fictício',
    requestedDate: '2026-12-15',
    requestedTime: '08:30',
    origin: 'Unidade Fictícia Norte',
    destination: 'Polo Fictício Sul',
    purpose: 'Missão administrativa fictícia',
    passengers: 2,
    status: 'PENDING',
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: '2026-11-12T12:00:00.000Z',
    updatedAt: '2026-11-12T12:00:00.000Z',
    trip: null,
    ...overrides,
  }
}

function makePage(requests) {
  return {
    requests,
    total: requests.length,
    page: 1,
    pageSize: 20,
    totalPages: requests.length > 0 ? 1 : 0,
  }
}

function LocationProbe() {
  const location = useLocation()
  return createElement('output', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
}

function mountPage(api, { profile = 'GESTOR', initialEntry = '/frota/solicitacoes/analise' } = {}) {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        AuthContext.Provider,
        {
          value: {
            session: sessionFor(profile),
            api,
            notice: '',
            logout() {},
            signIn: async () => {},
          },
        },
        createElement(RequestAnalysisPage),
        createElement(LocationProbe),
      ),
    ),
  )
  return userEvent.setup()
}

test('helpers validam datas, motivo de rejeição, guarda de decisão, setor ausente e textos em pt-BR', () => {
  assert.deepEqual(
    helpers.parseRequestAnalysisSearchParams('?from=2026-12-01&to=2026-12-01&requester=Alpha'),
    { from: '2026-12-01', to: '2026-12-01', requester: 'Alpha', service: '' },
  )
  assert.deepEqual(
    helpers.parseRequestAnalysisSearchParams('?from=2026-02-30&to=invalido'),
    { from: '', to: '', requester: '', service: '' },
  )
  assert.deepEqual(
    helpers.validateRequestAnalysisFilters({ from: '2026-12-10', to: '2026-12-05', requester: '', service: '' }),
    { to: 'A data final deve ser igual ou posterior à data inicial.' },
  )
  assert.equal(helpers.validateRejectionReason('   '), 'Informe a justificativa da rejeição.')
  assert.equal(helpers.validateRejectionReason('Sem viatura'), undefined)

  const pendingDetail = makeRequest({ id: '50', status: 'PENDING' })
  assert.equal(helpers.canDecideLoadedRequest({
    selectedId: '50', detail: pendingDetail, detailLoading: false, detailError: '', conflictedRequestId: null,
  }), true)
  assert.equal(helpers.canDecideLoadedRequest({
    selectedId: '50', detail: pendingDetail, detailLoading: true, detailError: '', conflictedRequestId: null,
  }), false)
  assert.equal(helpers.canDecideLoadedRequest({
    selectedId: '50', detail: pendingDetail, detailLoading: false, detailError: 'Erro 503', conflictedRequestId: null,
  }), false)
  assert.equal(helpers.canDecideLoadedRequest({
    selectedId: '50', detail: makeRequest({ id: '50', status: 'APPROVED' }), detailLoading: false, detailError: '', conflictedRequestId: null,
  }), false)
  assert.equal(helpers.canDecideLoadedRequest({
    selectedId: '50', detail: pendingDetail, detailLoading: false, detailError: '', conflictedRequestId: '50',
  }), false)

  assert.equal(helpers.resolveRequesterSector(pendingDetail), 'Não informado')
  assert.equal(
    helpers.resolveRequesterSector(makeRequest({ id: '50', requesterSector: '  Hemocentro Fictício  ' })),
    'Hemocentro Fictício',
  )
  assert.equal(
    helpers.resolveRequesterSector(makeRequest({ id: '50', requesterSector: null })),
    'Não informado',
  )
  assert.equal(helpers.formatPaginationRowsLabel({ from: 0, to: 0, count: 0 }), '0 de 0')
  assert.equal(helpers.formatPaginationRowsLabel({ from: 1, to: 10, count: 25 }), '1–10 de 25')
  assert.equal(helpers.getPaginationItemAriaLabel('previous'), 'Página anterior')
  assert.equal(helpers.getPaginationItemAriaLabel('next'), 'Próxima página')
})

test('T14-P01: bloqueia decisão enquanto detalhe carrega, em erro 503 (com recuperação) e em detalhe já decidido', async () => {
  let detailMode = 'pending-deferred'
  let resolveDetail = null
  const summary = makeRequest({ id: '50', status: 'PENDING' })

  const api = async (requestPath) => {
    if (requestPath.startsWith('/requests?')) return Response.json(makePage([summary]))
    if (requestPath === '/requests/50') {
      if (detailMode === 'pending-deferred') {
        return new Promise((resolve) => {
          resolveDetail = () => resolve(Response.json({ erro: 'Serviço temporariamente indisponível.' }, { status: 503 }))
        })
      }
      if (detailMode === 'pending-ok') {
        return Response.json(makeRequest({
          id: '50',
          status: 'PENDING',
          requesterSector: 'Hemocentro Fictício',
        }))
      }
      return Response.json(makeRequest({
        id: '50',
        status: 'APPROVED',
        requesterSector: null,
        decidedBy: '2',
        decidedByName: 'Gestor Fictício 2',
        decidedAt: '2026-11-24T10:00:00.000Z',
        decisionReason: null,
      }))
    }
    throw new Error(`Rota inesperada: ${requestPath}`)
  }

  const user = mountPage(api)
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 50' }))

  // Durante o carregamento do detalhe, aprovar/recusar ficam desabilitados
  assert.ok(screen.getByText('Carregando dados da solicitação...'))
  assert.equal(screen.getByRole('button', { name: 'Aprovar solicitação' }).disabled, true)
  assert.equal(screen.getByRole('button', { name: 'Recusar definitivamente' }).disabled, true)

  // Erro 503 mantém botões desabilitados e permite Tentar novamente mantendo a seleção
  resolveDetail()
  assert.ok(await screen.findByText('Serviço temporariamente indisponível.'))
  assert.equal(screen.getByRole('button', { name: 'Aprovar solicitação' }).disabled, true)
  assert.equal(screen.getByRole('button', { name: 'Recusar definitivamente' }).disabled, true)
  assert.ok(screen.getByRole('button', { name: 'Solicitação selecionada 50' }))

  detailMode = 'pending-ok'
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Missão administrativa fictícia'))
  assert.equal(screen.getByText('Setor do solicitante').tagName, 'DT')
  assert.equal(screen.getByText('Hemocentro Fictício').tagName, 'DD')
  assert.equal(screen.getByRole('button', { name: 'Aprovar solicitação' }).disabled, false)
  assert.equal(screen.getByRole('button', { name: 'Recusar definitivamente' }).disabled, false)

  // Se a fila estava obsoleta e o detalhe já está decidido (pedido antigo sem setor), ações permanecem desabilitadas e setor exibe fallback legível
  cleanup()
  detailMode = 'already-decided'
  const user2 = mountPage(api)
  await user2.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 50' }))
  assert.ok(await screen.findByText(/já está com situação aprovada/i))
  assert.equal(screen.getByText('Não informado').tagName, 'DD')
  assert.equal(screen.getByRole('button', { name: 'Aprovar solicitação' }).disabled, true)
  assert.equal(screen.getByRole('button', { name: 'Recusar definitivamente' }).disabled, true)
})

test('T14-P02: em 409 invalida confirmação imediatamente, reconsulta detalhe e fila preservando filtros e move foco ao fechar', async () => {
  let decided = false
  const listQueries = []
  const summary = makeRequest({ id: '50', requesterName: 'Servidora Fictícia Alpha' })

  const api = async (requestPath, options = {}) => {
    if (requestPath.startsWith('/requests?')) {
      listQueries.push(requestPath)
      return Response.json(makePage(decided ? [] : [summary]))
    }
    if (requestPath === '/requests/50') {
      return Response.json(
        decided
          ? makeRequest({
              id: '50',
              status: 'REJECTED',
              decidedBy: '7',
              decidedByName: 'Gestor Fictício 7',
              decidedAt: '2026-11-24T10:15:00.000Z',
              decisionReason: 'Sem motorista disponível no turno.',
            })
          : summary,
      )
    }
    if (requestPath === '/requests/50/approve' && options.method === 'POST') {
      decided = true
      return Response.json({ erro: 'Esta solicitação já foi analisada.' }, { status: 409 })
    }
    throw new Error(`Rota inesperada: ${requestPath}`)
  }

  const user = mountPage(api, { initialEntry: '/frota/solicitacoes/analise?from=2026-12-01&to=2026-12-20' })
  assert.ok(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 50' }))
  assert.match(listQueries[0], /from=2026-12-01/)
  assert.match(listQueries[0], /to=2026-12-20/)

  await user.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação 50' }))
  await screen.findByText('Missão administrativa fictícia')
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Aprovar solicitação' }).disabled, false))
  await user.click(screen.getByRole('button', { name: 'Aprovar solicitação' }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Aprovar solicitação' }))

  const alert = await within(dialog).findByRole('alert')
  assert.match(alert.textContent ?? '', /Esta solicitação já foi analisada\./)
  assert.match(alert.textContent ?? '', /fila e o detalhe estão sendo atualizados/i)
  assert.equal(within(dialog).getByRole('button', { name: 'Aprovar solicitação' }).disabled, true)

  await waitFor(() => assert.equal(listQueries.length, 2))
  assert.match(listQueries[1], /from=2026-12-01/)
  assert.match(listQueries[1], /to=2026-12-20/)

  await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
  const statusBanner = await screen.findByText(/solicitação #50 já recebeu decisão/i)
  for (let i = 0; i < 20; i += 1) {
    if (document.activeElement === statusBanner.closest('[role="status"]')) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal(document.activeElement, statusBanner.closest('[role="status"]'))
  assert.ok(await screen.findByText('Nenhuma solicitação pendente encontrada.'))
  assert.ok(await screen.findByText('Gestor Fictício 7'))
  assert.ok(screen.getByText('Sem motorista disponível no turno.'))
  assert.equal(screen.getByRole('button', { name: 'Aprovar solicitação' }).disabled, true)
  assert.equal(screen.getByRole('button', { name: 'Recusar definitivamente' }).disabled, true)
})

test('T14-P06, T14-C02 e L18: valida filtros com foco no primeiro inválido, justificativa e paginação em pt-BR e cards em 320/375px', async () => {
  compactViewport = true
  const api = async (requestPath) => {
    if (requestPath.startsWith('/requests?')) {
      return Response.json(makePage([makeRequest({ id: '61' })]))
    }
    if (requestPath === '/requests/61') {
      return Response.json(makeRequest({ id: '61' }))
    }
    throw new Error(`Rota inesperada: ${requestPath}`)
  }

  const user = mountPage(api)
  // Modo compacto (320/375px) renderiza EntityCard sem tabela com rolagem horizontal
  const card = await screen.findByRole('article')
  assert.ok(within(card).getByRole('button', { name: 'Ver detalhes da solicitação 61' }))
  assert.equal(screen.queryByRole('table'), null)

  // Paginação em português
  assert.ok(screen.getByRole('button', { name: 'Página anterior' }))
  assert.ok(screen.getByRole('button', { name: 'Próxima página' }))

  // Validação de período invertido foca o campo Data final
  const fromInput = screen.getByLabelText('Data inicial')
  const toInput = screen.getByLabelText('Data final')
  fireEvent.change(fromInput, { target: { value: '2026-12-20' } })
  fireEvent.change(toInput, { target: { value: '2026-12-10' } })
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  assert.equal(toInput.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, toInput)

  await user.click(screen.getByRole('button', { name: 'Limpar' }))
  assert.equal(toInput.getAttribute('aria-invalid'), null)

  // Rejeição foca a justificativa na abertura e mostra erro inline para espaços
  await user.click(within(await screen.findByRole('article')).getByRole('button', { name: 'Ver detalhes da solicitação 61' }))
  await screen.findByText('Missão administrativa fictícia')
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Recusar definitivamente' }).disabled, false))
  await user.click(screen.getByRole('button', { name: 'Recusar definitivamente' }))
  const dialog = await screen.findByRole('dialog')
  const reasonInput = within(dialog).getByRole('textbox', { name: 'Justificativa da recusa definitiva' })
  for (let i = 0; i < 20; i += 1) {
    if (document.activeElement === reasonInput) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal(document.activeElement, reasonInput)
  await user.type(reasonInput, '   ')
  assert.equal(reasonInput.getAttribute('aria-invalid'), 'true')
  assert.ok(await within(dialog).findByText('Informe a justificativa da rejeição.'))
  assert.equal(within(dialog).getByRole('button', { name: 'Recusar definitivamente' }).disabled, true)
})

test('RBAC e document.title: bloqueia perfil sem permissão e restaura título ao desmontar', async () => {
  mountPage(async () => {
    throw new Error('SOLICITANTE não deveria consultar /requests na análise.')
  }, { profile: 'SOLICITANTE' })

  assert.equal(document.title, 'Análise de solicitações — Aratu')
  assert.ok(await screen.findByText('Somente o perfil Gestor de Frota pode analisar solicitações de viagem.'))
  cleanup()
  assert.equal(document.title, 'Início — Aratu')
})
