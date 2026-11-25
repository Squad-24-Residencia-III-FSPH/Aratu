// Somente dados 100% fictícios (LGPD/SVO).
import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { dom, testing, vite, closeAuthDom } from '../../tests/auth-dom.fixture.mjs'
import { tokenFor } from '../../tests/fixtures.mjs'

const { render, cleanup, act } = testing
const [
  { AuthProvider },
  { useAuth },
  { createSessionDraftStore, useSessionDraft, useSessionContinuity },
  { resolveRevalidationPath },
] = await Promise.all([
  vite.ssrLoadModule('/src/auth/AuthProvider.tsx'),
  vite.ssrLoadModule('/src/auth/useAuth.ts'),
  vite.ssrLoadModule('/src/auth/sessionDrafts.ts'),
  vite.ssrLoadModule('/src/auth/revalidation.ts'),
])

const KEY = 'aratu.auth.session'
const originalFetch = globalThis.fetch
const credentials = { email: 'ficticio@example.invalid', senha: 'senha-ficticia-segura' }

function sessionWithId(perfil, id, seconds = 3600) {
  return {
    token: tokenFor(perfil, seconds, { id }),
    nome: `Pessoa Fictícia ${id}`,
    perfil,
  }
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  globalThis.fetch = originalFetch
  window.history.replaceState(null, '', '/')
})
after(closeAuthDom)

test('createSessionDraftStore preserva rascunho para mesmo usuário e descarta na troca ou logout', () => {
  const store = createSessionDraftStore()
  store.bindUser('101')
  store.setDraft('requests:new', { destination: 'Unidade Fictícia Sul' })
  store.setReturnPath('/solicitacoes/minhas')

  // Novo token do mesmo usuário mantém dados em memória.
  store.bindUser('101')
  assert.deepEqual(store.getDraft('requests:new'), { destination: 'Unidade Fictícia Sul' })
  assert.equal(store.getReturnPath(), '/solicitacoes/minhas')

  // Troca de usuário descarta imediatamente.
  store.bindUser('202')
  assert.equal(store.getDraft('requests:new'), undefined)
  assert.equal(store.getReturnPath(), null)
  assert.equal(store.getOwnerUserId(), '202')

  store.setDraft('trip-confirmation:filters', { from: '2026-11-01' })
  store.setReturnPath('/viagens/confirmacao')
  store.clear()
  assert.equal(store.getDraft('trip-confirmation:filters'), undefined)
  assert.equal(store.consumeReturnPath(), null)
  assert.equal(store.getOwnerUserId(), null)
})

test('resolveRevalidationPath mapeia /auth/me para todos os 6 perfis sem consultar dados de outro perfil', () => {
  assert.equal(resolveRevalidationPath('SOLICITANTE'), '/auth/me')
  assert.equal(resolveRevalidationPath('GESTOR'), '/auth/me')
  assert.equal(resolveRevalidationPath('ADMINISTRADOR'), '/auth/me')
  assert.equal(resolveRevalidationPath('MOTORISTA'), '/auth/me')
  assert.equal(resolveRevalidationPath('ATENDENTE_SVO'), '/auth/me')
  assert.equal(resolveRevalidationPath('EQUIPE_SVO'), '/auth/me')
  assert.equal(resolveRevalidationPath('DESCONHECIDO'), null)
})

test('política SVO descarta rascunhos sensíveis na expiração enquanto preserva rascunhos não sensíveis para o mesmo usuário', async () => {
  const svo = sessionWithId('ATENDENTE_SVO', 505)
  window.localStorage.setItem(KEY, JSON.stringify(svo))
  window.history.replaceState(null, '', '/#/svo/ocorrencias')

  let auth
  let sensitiveApi
  let filterApi
  function Probe() {
    auth = useAuth()
    const [sensitiveDraft, setSensitiveDraft] = useSessionDraft('svo:occurrence', { nomeFalecido: '' }, { sensitive: true })
    const [filterDraft, setFilterDraft] = useSessionDraft('svo:filters', { status: 'OPEN' })
    sensitiveApi = { draft: sensitiveDraft, setDraft: setSensitiveDraft }
    filterApi = { draft: filterDraft, setDraft: setFilterDraft }
    return createElement('div', null, sensitiveDraft.nomeFalecido || 'LIMPO')
  }

  render(createElement(AuthProvider, null, createElement(Probe)))
  act(() => {
    sensitiveApi.setDraft({ nomeFalecido: 'Pessoa Fictícia SVO' })
    filterApi.setDraft({ status: 'CONFIRMED' })
  })

  globalThis.fetch = async () => Response.json({ erro: 'Token inválido ou expirado.' }, { status: 401 })
  await act(async () => { await assert.rejects(auth.api('/svo/occurrences'), /expirou/) })

  assert.equal(auth.session, null)
  assert.deepEqual(sensitiveApi.draft, { nomeFalecido: '' })
  assert.deepEqual(filterApi.draft, { status: 'CONFIRMED' })
})

test('rascunho em memória sobrevive à expiração para o mesmo userId e é descartado em logout ou troca de conta', async () => {
  const s101a = sessionWithId('SOLICITANTE', 101)
  const s101b = sessionWithId('SOLICITANTE', 101)
  const s202 = sessionWithId('GESTOR', 202)
  window.localStorage.setItem(KEY, JSON.stringify(s101a))
  window.history.replaceState(null, '', '/#/solicitacoes/minhas')

  let auth
  let draftApi
  let continuity
  function Probe() {
    auth = useAuth()
    continuity = useSessionContinuity()
    const [draft, setDraft] = useSessionDraft('solicitacao:nova', { destino: '' })
    draftApi = { draft, setDraft }
    return createElement('div', null, draft.destino || 'VAZIO')
  }

  render(createElement(AuthProvider, null, createElement(Probe)))
  act(() => draftApi.setDraft({ destino: 'Hospital Fictício Central' }))

  // Garantia LGPD/SVO: rascunho não vai para WebStorage.
  assert.equal(window.localStorage.length, 1)
  assert.equal(window.sessionStorage.length, 0)
  assert.equal(JSON.stringify(window.localStorage.getItem(KEY)).includes('Hospital Fictício'), false)

  // Expiração involuntária via 401 genérico preserva rascunho e rota de retorno em memória.
  globalThis.fetch = async () => Response.json({ erro: 'Token inválido ou expirado.' }, { status: 401 })
  await act(async () => { await assert.rejects(auth.api('/requests'), /expirou/) })
  assert.equal(auth.session, null)
  assert.equal(continuity.getReturnPath(), '/solicitacoes/minhas')
  assert.deepEqual(draftApi.draft, { destino: 'Hospital Fictício Central' })

  // Mesmo userId retorna e conserva o rascunho.
  globalThis.fetch = async () => Response.json(s101b)
  await act(async () => { await auth.signIn(credentials) })
  assert.deepEqual(draftApi.draft, { destino: 'Hospital Fictício Central' })
  assert.equal(continuity.consumeReturnPath(), '/solicitacoes/minhas')

  // Logout intencional descarta rascunho imediatamente.
  globalThis.fetch = async () => Response.json({ mensagem: 'ok' })
  act(() => auth.logout())
  assert.deepEqual(draftApi.draft, { destino: '' })

  // Novo rascunho do usuário 101 é descartado ao entrar com usuário 202.
  globalThis.fetch = async () => Response.json(s101a)
  await act(async () => { await auth.signIn(credentials) })
  act(() => draftApi.setDraft({ destino: 'Unidade Fictícia Norte' }))
  globalThis.fetch = async () => Response.json({ erro: 'Token inválido' }, { status: 401 })
  await act(async () => { await assert.rejects(auth.api('/requests'), /expirou/) })

  globalThis.fetch = async () => Response.json(s202)
  await act(async () => { await auth.signIn(credentials) })
  assert.deepEqual(draftApi.draft, { destino: '' })
})

test('retomada de foco e visibilidade revalida sessão ativa e limpa contexto local quando revogada (401)', async () => {
  const solicitante = sessionWithId('SOLICITANTE', 303)
  window.localStorage.setItem(KEY, JSON.stringify(solicitante))
  let auth
  let draftApi
  function Probe() {
    auth = useAuth()
    const [draft, setDraft] = useSessionDraft('solicitacao:nova', { destino: '' })
    draftApi = { draft, setDraft }
    return createElement('div', null, auth.session?.nome ?? 'LOGIN')
  }

  render(createElement(AuthProvider, null, createElement(Probe)))
  act(() => draftApi.setDraft({ destino: 'Dado sensível em andamento' }))

  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return Response.json(
      { erro: 'Sua conta não está ativa. Entre novamente ou procure a administração.' },
      { status: 401 },
    )
  }

  await act(async () => {
    window.dispatchEvent(new dom.window.Event('focus'))
    await Promise.resolve()
  })

  assert.equal(calls.length, 1)
  assert.ok(calls[0].endsWith('/auth/me'))
  assert.equal(auth.session, null)
  assert.equal(window.localStorage.getItem(KEY), null)
  assert.equal(auth.notice, 'Sua conta não está ativa. Entre novamente ou procure a administração.')
  assert.deepEqual(draftApi.draft, { destino: '' })
})

test('retomada offline ou com 403 preserva sessão ativa e aplica throttle entre eventos', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] })
  const svo = sessionWithId('MOTORISTA', 404)
  window.localStorage.setItem(KEY, JSON.stringify(svo))
  let auth
  function Probe() {
    auth = useAuth()
    return createElement('div', null, auth.session?.perfil ?? 'LOGIN')
  }

  render(createElement(AuthProvider, null, createElement(Probe)))
  let calls = 0
  globalThis.fetch = async (url) => {
    calls++
    assert.ok(String(url).endsWith('/auth/me'))
    return Response.json({ id: '404', perfil: 'MOTORISTA' })
  }

  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  await act(async () => {
    document.dispatchEvent(new dom.window.Event('visibilitychange'))
    await Promise.resolve()
  })
  assert.equal(calls, 1)
  assert.ok(auth.session)

  // Evento imediato dentro da janela de throttle não duplica requisição.
  await act(async () => {
    window.dispatchEvent(new dom.window.Event('focus'))
    await Promise.resolve()
  })
  assert.equal(calls, 1)

  // Após throttle, falha de rede não derruba sessão válida.
  t.mock.timers.tick(16_000)
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('offline')
  }
  await act(async () => {
    window.dispatchEvent(new dom.window.Event('focus'))
    await Promise.resolve()
  })
  assert.equal(calls, 2)
  assert.ok(auth.session)
})
