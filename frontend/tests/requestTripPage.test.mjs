import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { sessionFor } from './fixtures.mjs'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
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
  dispatchEvent() {
    return false
  },
})
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  { default: RequestTripPage },
  { default: SolicitacaoPage },
  { AuthContext },
  { clearCreatedRequestsStore },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/RequestTripPage.tsx'),
  vite.ssrLoadModule('/src/pages/SolicitacaoPage/SolicitacaoPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/requests/createdRequestsStore.ts'),
])

afterEach(() => {
  cleanup()
  clearCreatedRequestsStore()
})
after(async () => {
  await vite.close()
  dom.window.close()
})

const ACTIVE_SERVICES = [
  { id: '1', name: 'Transporte Administrativo', description: 'Unidades FSPH', active: true },
  { id: '2', name: 'Transporte de Insumos', description: 'Lacen / Hemose', active: true },
]

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderFlow(api, initialEntry = '/solicitacoes/nova') {
  const auth = {
    session: sessionFor('SOLICITANTE'),
    signIn: async () => {},
    logout() {},
    api,
    notice: '',
  }
  return render(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        MemoryRouter,
        {
          initialEntries: [initialEntry],
          future: { v7_startTransition: true, v7_relativeSplatPath: true },
        },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/solicitacoes/nova', element: createElement(RequestTripPage) }),
          createElement(Route, { path: '/solicitacoes/minhas', element: createElement(SolicitacaoPage) }),
        ),
      ),
    ),
  )
}

test('carrega GET /services, envia POST /requests com bloqueio de duplo clique, exibe "Solicitação registrada" e lista como Pendente', async () => {
  let resolvePost
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    if (init.method === 'POST' && path === '/requests') {
      return new Promise((resolve) => {
        resolvePost = resolve
      })
    }
    return jsonResponse(ACTIVE_SERVICES)
  }

  renderFlow(api)
  const user = userEvent.setup()

  await screen.findByRole('heading', { name: 'Nova solicitação de viagem' })
  await screen.findByRole('combobox', { name: /Tipo de serviço/i })

  const dateInput = document.querySelector('input[type="date"]')
  const timeInput = document.querySelector('input[type="time"]')
  fireEvent.change(dateInput, { target: { value: '2027-05-20' } })
  fireEvent.change(timeInput, { target: { value: '14:30' } })

  await user.click(screen.getByRole('combobox', { name: /Tipo de serviço/i }))
  await user.click(await screen.findByRole('option', { name: 'Transporte de Insumos' }))

  await user.type(screen.getByRole('textbox', { name: /Origem/i }), 'FSPH — Unidade Central')
  await user.type(screen.getByRole('textbox', { name: /Destino/i }), 'Hemose — Bloco A')
  await user.type(
    screen.getByRole('textbox', { name: /Finalidade/i }),
    'Transporte de amostras laboratoriais',
  )

  await user.click(screen.getByRole('button', { name: 'Solicitar viagem' }))

  const sendingButton = await screen.findByRole('button', { name: 'Enviando solicitação...' })
  assert.equal(sendingButton.disabled, true)

  const postCalls = calls.filter(({ path, init }) => path === '/requests' && init.method === 'POST')
  assert.equal(postCalls.length, 1)
  assert.deepEqual(JSON.parse(postCalls[0].init.body), {
    requestedDate: '2027-05-20',
    requestedTime: '14:30',
    origin: 'FSPH — Unidade Central',
    destination: 'Hemose — Bloco A',
    purpose: 'Transporte de amostras laboratoriais',
    serviceId: '2',
  })

  resolvePost(jsonResponse({ id: 'SOL-780', status: 'PENDING' }, 201))

  await waitFor(() => {
    assert.ok(screen.getByText('Solicitação registrada'))
  })
  assert.ok(await screen.findByRole('heading', { name: 'Minhas Solicitações' }))
  assert.ok(screen.getByText('SOL-780'))
  assert.ok(screen.getByText('Hemose — Bloco A'))
  assert.ok(screen.getByText('Transporte de amostras laboratoriais'))
  assert.ok(screen.getAllByText('Pendente').length >= 1)
})

test('bloqueia envio quando campos obrigatórios estão vazios e exibe mensagens de erro acessíveis', async () => {
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    return jsonResponse(ACTIVE_SERVICES)
  }

  renderFlow(api)
  const user = userEvent.setup()

  await screen.findByRole('combobox', { name: /Tipo de serviço/i })
  await user.click(screen.getByRole('button', { name: 'Solicitar viagem' }))

  assert.ok(await screen.findByText('Informe a data da viagem.'))
  assert.ok(screen.getByText('Informe o horário de saída.'))
  assert.ok(screen.getByText('Selecione o tipo de serviço.'))
  assert.ok(screen.getByText('Informe o local de origem.'))
  assert.ok(screen.getByText('Informe o destino da viagem.'))
  assert.ok(screen.getByText('Informe a finalidade da viagem.'))
  assert.equal(
    calls.filter(({ path, init }) => path === '/requests' && init.method === 'POST').length,
    0,
  )
})

test('exibe erro 422 da API e falha de rede em role="alert" preservando os campos preenchidos sem falso sucesso', async () => {
  let mode = 'validation422'
  const api = async (path, init = {}) => {
    if (init.method === 'POST' && path === '/requests') {
      if (mode === 'validation422') {
        return jsonResponse(
          { erro: 'A data e o horário da viagem não podem estar no passado.' },
          422,
        )
      }
      throw new Error('Serviço temporariamente indisponível')
    }
    return jsonResponse(ACTIVE_SERVICES)
  }

  renderFlow(api)
  const user = userEvent.setup()

  await screen.findByRole('combobox', { name: /Tipo de serviço/i })
  fireEvent.change(document.querySelector('input[type="date"]'), {
    target: { value: '2027-06-10' },
  })
  fireEvent.change(document.querySelector('input[type="time"]'), {
    target: { value: '09:15' },
  })
  await user.click(screen.getByRole('combobox', { name: /Tipo de serviço/i }))
  await user.click(await screen.findByRole('option', { name: 'Transporte Administrativo' }))
  await user.type(screen.getByRole('textbox', { name: /Origem/i }), 'FSPH — Unidade Central')
  await user.type(screen.getByRole('textbox', { name: /Destino/i }), 'HUSE — Setor de Coleta')
  await user.type(screen.getByRole('textbox', { name: /Finalidade/i }), 'Entrega de documentação')

  await user.click(screen.getByRole('button', { name: 'Solicitar viagem' }))

  assert.ok(
    await screen.findByText('A data e o horário da viagem não podem estar no passado.'),
  )
  assert.equal(screen.queryByText('Solicitação registrada'), null)
  assert.equal(screen.getByRole('textbox', { name: /Destino/i }).value, 'HUSE — Setor de Coleta')

  mode = 'networkError'
  await user.click(screen.getByRole('button', { name: 'Solicitar viagem' }))

  assert.ok(await screen.findByText('Serviço temporariamente indisponível'))
  assert.equal(screen.queryByText('Solicitação registrada'), null)
  assert.equal(screen.getByRole('textbox', { name: /Origem/i }).value, 'FSPH — Unidade Central')
})

test('trata erro e estado vazio no carregamento de GET /services com botão de tentar novamente', async () => {
  let attempt = 0
  const api = async () => {
    attempt += 1
    if (attempt === 1) {
      throw new Error('Serviço temporariamente indisponível')
    }
    return jsonResponse([])
  }

  renderFlow(api)
  const user = userEvent.setup()

  assert.ok(await screen.findByText('Serviço temporariamente indisponível'))
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhum tipo de serviço disponível'))
})
