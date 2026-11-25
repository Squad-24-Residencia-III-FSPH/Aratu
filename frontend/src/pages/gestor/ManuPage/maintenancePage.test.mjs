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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-l08-test-'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  SVGElement: { configurable: true, value: dom.window.SVGElement },
  Node: { configurable: true, value: dom.window.Node },
  DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
})
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const frontendRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: frontendRoot,
  plugins: [react()],
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  presentation,
  { default: ManutencaoPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/gestor/ManuPage/maintenancePresentation.ts'),
  vite.ssrLoadModule('/src/pages/gestor/ManuPage/ManutencaoPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeSession(perfil = 'GESTOR') {
  const payload = Buffer.from(JSON.stringify({ sub: '2', perfil, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return { token: `h.${payload}.s`, perfil, nome: 'Gestora Fictícia', email: 'gestor@aratu.test' }
}

function makeVehicle(overrides = {}) {
  return {
    id: '4',
    licensePlate: 'TQA5V23',
    brand: 'Marca Fictícia',
    model: 'Passageiro Fictício',
    year: 2025,
    vehicleType: 'Van',
    ownership: 'OWNED',
    categories: ['PASSENGER'],
    seats: 5,
    bodyLimit: 0,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
    status: 'AVAILABLE',
    revision: 5,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeOrder(overrides = {}) {
  return {
    id: '1',
    vehicleId: '4',
    type: 'CORRECTIVE',
    description: 'Troca de filtro fictício',
    blocksVehicle: false,
    workshop: 'Oficina Fictícia',
    odometerKm: 12000,
    expectedCompletionDate: null,
    status: 'OPEN',
    revision: 1,
    openedAt: '2026-11-21T19:00:00.000Z',
    closedAt: null,
    createdAt: '2026-11-21T19:00:00.000Z',
    updatedAt: '2026-11-21T19:00:00.000Z',
    createdBy: '2',
    closedBy: null,
    vehicleSnapshot: makeVehicle(),
    estimateItems: [{ kind: 'PART', description: 'Filtro fictício', quantity: '1', unitPrice: '18.75', subtotal: '18.75' }],
    estimatedTotal: '18.75',
    actualItems: null,
    cost: null,
    finalCost: null,
    ...overrides,
  }
}

function renderPage(api, perfil = 'GESTOR') {
  const auth = { session: fakeSession(perfil), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(ManutencaoPage)))
}

test('T08-P01 · confirmação distingue ordem não impeditiva, retirada de último impedimento e inativação independente', () => {
  const vehicleInMaintenance = makeVehicle({ status: 'IN_MAINTENANCE', revision: 6 })
  const vehicleInactive = makeVehicle({ status: 'INACTIVE', revision: 6 })
  const order1 = makeOrder({ id: '1', blocksVehicle: false })
  const order2 = makeOrder({ id: '2', type: 'PREVENTIVE', blocksVehicle: true })

  const sitNonBlockingWhile2Active = presentation.buildVehicleSituation(order1, [vehicleInMaintenance], [order1, order2])
  assert.equal(sitNonBlockingWhile2Active.kind, 'blocked_by_other')
  const msgNonBlocking = presentation.buildCloseConsequenceDescription(order1, { loading: false, error: '', situation: sitNonBlockingWhile2Active })
  assert.match(msgNonBlocking, /NÃO é impeditiva/i)
  assert.match(msgNonBlocking, /ordem impeditiva ativa #2/i)

  const sitLastBlocking = presentation.buildVehicleSituation(order2, [vehicleInMaintenance], [order1, order2])
  assert.equal(sitLastBlocking.kind, 'blocked_by_this')
  const msgLastBlocking = presentation.buildCloseConsequenceDescription(order2, { loading: false, error: '', situation: sitLastBlocking })
  assert.match(msgLastBlocking, /É impeditiva/i)
  assert.match(msgLastBlocking, /voltará a ficar Disponível/i)

  const sitInactive = presentation.buildVehicleSituation(order2, [vehicleInactive], [order2])
  assert.equal(sitInactive.kind, 'inactive')
  const msgInactive = presentation.buildCloseConsequenceDescription(order2, { loading: false, error: '', situation: sitInactive })
  assert.match(msgInactive, /inativação independente/i)
  assert.match(msgInactive, /permanecerá Inativo/i)
})

test('T08-P01 · encerrar ordem não impeditiva e último impedimento exibe situação real do veículo', async () => {
  let vehicles = [makeVehicle({ status: 'IN_MAINTENANCE', revision: 6 })]
  let orders = [
    makeOrder({ id: '1', blocksVehicle: false, status: 'OPEN', revision: 1 }),
    makeOrder({ id: '2', type: 'PREVENTIVE', blocksVehicle: true, status: 'OPEN', revision: 1, estimatedTotal: '77.50' }),
  ]

  const api = async (urlPath, options = {}) => {
    if (urlPath === '/vehicles') return jsonResponse(vehicles)
    if (urlPath === '/maintenance-orders' || urlPath.startsWith('/maintenance-orders?')) {
      return jsonResponse({ items: orders, totalSpent: '0.00' })
    }
    const closeMatch = urlPath.match(/^\/maintenance-orders\/(\d+)\/close$/)
    if (closeMatch && options.method === 'PATCH') {
      const targetId = closeMatch[1]
      orders = orders.map((item) => (item.id === targetId
        ? { ...item, status: 'DONE', revision: item.revision + 1, finalCost: item.estimatedTotal, cost: item.estimatedTotal, closedAt: '2026-11-22T18:00:00.000Z', closedBy: '2' }
        : item))
      if (targetId === '2') {
        vehicles = [makeVehicle({ status: 'AVAILABLE', revision: 7 })]
      }
      return jsonResponse(orders.find((item) => item.id === targetId))
    }
    const getMatch = urlPath.match(/^\/maintenance-orders\/(\d+)$/)
    if (getMatch) {
      return jsonResponse(orders.find((item) => item.id === getMatch[1]))
    }
    return jsonResponse({ erro: 'Não encontrado.' }, 404)
  }

  const user = userEvent.setup()
  renderPage(api)

  await screen.findByRole('button', { name: 'Ver ordem 1 do veículo TQA5V23' })
  await user.click(screen.getByRole('button', { name: 'Ver ordem 1 do veículo TQA5V23' }))

  const detail1 = await screen.findByRole('dialog', { name: /Ordem de serviço #1/ })
  assert.ok(within(detail1).getByText(/Não impeditiva — não bloqueia o veículo/))
  await user.click(within(detail1).getByRole('button', { name: 'Encerrar manutenção' }))
  await user.type(within(detail1).getByRole('textbox', { name: /Origem da informação/ }), 'Oficina fictícia')
  await user.type(within(detail1).getByRole('textbox', { name: /Justificativa do encerramento/ }), 'Conclusão fictícia')
  await user.click(within(detail1).getByRole('button', { name: 'Revisar encerramento' }))

  const confirm1 = await screen.findByRole('dialog', { name: 'Encerrar ordem #1?' })
  assert.ok(within(confirm1).getByText(/NÃO é impeditiva/))
  assert.ok(within(confirm1).getByText(/ordem impeditiva ativa #2/))
  await user.click(within(confirm1).getByRole('button', { name: 'Confirmar encerramento' }))

  await waitFor(() => {
    assert.ok(within(screen.getByRole('dialog', { name: /Ordem de serviço #1/ })).getByRole('status').textContent.includes('ordem impeditiva ativa #2'))
  })

  await user.click(screen.getByRole('button', { name: 'Fechar' }))
  assert.ok(screen.getByRole('status').textContent.includes('ordem impeditiva ativa #2'))
  await user.click(screen.getByRole('button', { name: 'Ver ordem 2 do veículo TQA5V23' }))

  const detail2 = await screen.findByRole('dialog', { name: /Ordem de serviço #2/ })
  assert.ok(within(detail2).getByText(/Impeditiva — bloqueia o veículo/))
  await user.click(within(detail2).getByRole('button', { name: 'Encerrar manutenção' }))
  await user.type(within(detail2).getByRole('textbox', { name: /Origem da informação/ }), 'Oficina fictícia')
  await user.type(within(detail2).getByRole('textbox', { name: /Justificativa do encerramento/ }), 'Último impedimento')
  await user.click(within(detail2).getByRole('button', { name: 'Revisar encerramento' }))

  const confirm2 = await screen.findByRole('dialog', { name: 'Encerrar ordem #2?' })
  assert.ok(within(confirm2).getByText(/É impeditiva/))
  assert.ok(within(confirm2).getByText(/voltará a ficar Disponível/))
  await user.click(within(confirm2).getByRole('button', { name: 'Confirmar encerramento' }))

  await waitFor(() => {
    assert.ok(within(screen.getByRole('dialog', { name: /Ordem de serviço #2/ })).getByRole('status').textContent.includes('Disponível para viagens (revisão 7)'))
  })
  await user.click(screen.getByRole('button', { name: 'Fechar' }))
  assert.ok(screen.getByRole('status').textContent.includes('Disponível para viagens (revisão 7)'))
})

test('T08-P02 · conflito 409 identifica ordem bloqueadora via API autorizada e não recarrega a mesma ordem', async () => {
  const order1 = makeOrder({ id: '1', blocksVehicle: false, status: 'OPEN', revision: 1 })
  const order2 = makeOrder({ id: '2', type: 'PREVENTIVE', blocksVehicle: true, status: 'OPEN', revision: 1 })

  const api = async (urlPath, options = {}) => {
    if (urlPath === '/vehicles') return jsonResponse([makeVehicle({ status: 'IN_MAINTENANCE', revision: 6 })])
    if (urlPath === '/maintenance-orders' || urlPath.startsWith('/maintenance-orders?')) return jsonResponse({ items: [order1, order2], totalSpent: '0.00' })
    if (urlPath === '/maintenance-orders/1' && options.method === 'PUT') {
      return jsonResponse({ erro: 'Já existe uma manutenção impeditiva ativa. Consulte a ordem existente.' }, 409)
    }
    if (urlPath === '/maintenance-orders/1') return jsonResponse(order1)
    if (urlPath === '/maintenance-orders/2') return jsonResponse(order2)
    return jsonResponse({ erro: 'Não encontrado.' }, 404)
  }

  const user = userEvent.setup()
  renderPage(api)
  await user.click(await screen.findByRole('button', { name: 'Ver ordem 1 do veículo TQA5V23' }))
  await user.click(await screen.findByRole('button', { name: 'Editar orçamento / ordem' }))

  const formDialog = await screen.findByRole('dialog', { name: 'Editar ordem #1' })
  await user.click(within(formDialog).getByRole('combobox', { name: /Manutenção impeditiva\?/ }))
  await user.click(await screen.findByRole('option', { name: /Sim — bloquear veículo/ }))
  await user.type(within(formDialog).getByRole('textbox', { name: /Origem da informação/ }), 'Central fictícia')
  await user.type(within(formDialog).getByRole('textbox', { name: /Justificativa/ }), 'Tentativa de bloqueio')
  await user.click(within(formDialog).getByRole('button', { name: 'Salvar alterações' }))

  const alert = await within(formDialog).findByRole('alert')
  assert.match(alert.textContent, /ordem #2/i)
  assert.equal(within(formDialog).queryByRole('button', { name: 'Recarregar ordem' }), null)
  const inspectBtn = within(formDialog).getByRole('button', { name: 'Consultar ordem #2' })
  await user.click(inspectBtn)
  await screen.findByRole('dialog', { name: /Ordem de serviço #2/ })
})

test('T08-P03 · foco move para o primeiro campo inválido em período invertido, cadastro e orçamento negativo', async () => {
  const api = async (urlPath) => {
    if (urlPath === '/vehicles') return jsonResponse([makeVehicle()])
    return jsonResponse({ items: [], totalSpent: '0.00' })
  }

  const user = userEvent.setup()
  renderPage(api)
  await screen.findByText('Manutenção da Frota')

  const fromInput = screen.getByLabelText('Início do período')
  const toInput = screen.getByLabelText('Fim do período')
  fireEvent.change(fromInput, { target: { value: '2026-11-23T12:00' } })
  fireEvent.change(toInput, { target: { value: '2026-11-22T12:00' } })
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

  assert.equal(fromInput.getAttribute('aria-invalid'), 'true')
  assert.equal(toInput.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, fromInput)

  await user.click(screen.getByRole('button', { name: 'Registrar Manutenção' }))
  const dialog = await screen.findByRole('dialog', { name: 'Registrar Manutenção' })

  await user.click(within(dialog).getByRole('combobox', { name: /Veículo/ }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await user.type(within(dialog).getByRole('textbox', { name: /Descrição da manutenção/ }), 'Revisão de freios')
  await user.click(within(dialog).getByRole('combobox', { name: /Orçamento/ }))
  await user.click(await screen.findByRole('option', { name: /Informar peças e serviços orçados/ }))
  await user.click(within(dialog).getByRole('button', { name: 'Adicionar serviço' }))

  const serviceValueInput = within(dialog).getByLabelText(/Valor do serviço \(R\$\) 1/)
  await user.clear(serviceValueInput)
  await user.type(serviceValueInput, '-10')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar manutenção' }))

  const serviceDescInput = within(dialog).getByLabelText(/Itens orçados — serviço 1/)
  assert.equal(serviceDescInput.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, serviceDescInput)

  await user.type(serviceDescInput, 'Mão de obra fictícia')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar manutenção' }))
  assert.equal(serviceValueInput.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, serviceValueInput)
})

test('T08-P04 e T08-P06 · erro 503 em filtro mantém recorte anterior identificado como desatualizado e chips têm ícones distintos', async () => {
  const ordersAll = [
    makeOrder({ id: '1', type: 'CORRECTIVE', status: 'DONE', finalCost: '58.75', cost: '58.75' }),
    makeOrder({ id: '2', type: 'PREVENTIVE', status: 'OPEN', blocksVehicle: true }),
  ]
  let failFiltered = true
  const api = async (urlPath) => {
    if (urlPath === '/vehicles') return jsonResponse([makeVehicle()])
    if (urlPath.includes('type=PREVENTIVE') && failFiltered) {
      return jsonResponse({ erro: 'Serviço temporariamente indisponível.' }, 503)
    }
    if (urlPath.includes('type=PREVENTIVE')) {
      return jsonResponse({ items: [ordersAll[1]], totalSpent: '77.50' })
    }
    return jsonResponse({ items: ordersAll, totalSpent: '136.25' })
  }

  const user = userEvent.setup()
  renderPage(api)

  await screen.findByText('R$ 136,25')
  assert.ok(screen.getByText(/Recorte exibido nos totais e na listagem: Todos os veículos · Todos os tipos/))

  const openChipIcon = screen.getByText('Em aberto').closest('.MuiChip-root')?.querySelector('svg')?.getAttribute('data-testid')
  const doneChipIcon = screen.getByText('Concluída').closest('.MuiChip-root')?.querySelector('svg')?.getAttribute('data-testid')
  assert.ok(openChipIcon && doneChipIcon && openChipIcon !== doneChipIcon)

  await user.click(screen.getByRole('combobox', { name: 'Tipo' }))
  await user.click(await screen.findByRole('option', { name: 'Preventiva' }))
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

  await screen.findByText(/Os totais e a lista exibidos estão desatualizados e pertencem ao recorte anterior/)
  assert.ok(screen.getByText(/Recorte exibido \(desatualizado — última consulta bem-sucedida\): Todos os veículos · Todos os tipos/))
  assert.ok(screen.getByText('R$ 136,25'))

  failFiltered = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByText('R$ 77,50')
  assert.ok(screen.getByText(/Recorte exibido nos totais e na listagem: Todos os veículos · Preventiva/))
})
