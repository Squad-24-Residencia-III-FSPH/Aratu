import test from 'node:test'
import assert from 'node:assert/strict'
import { login, parseLoginResponse, INVALID_CREDENTIALS, SERVICE_UNAVAILABLE } from '../src/auth/loginService.ts'
import { validateLogin } from '../src/auth/validation.ts'
import { readSession, saveSession, clearSession, SESSION_KEY } from '../src/auth/sessionStorage.ts'
import { sessionFor, tokenFor } from './fixtures.mjs'
import { SESSION_EXPIRED } from '../src/auth/token.ts'

// Fixtures exclusivas dos testes; nenhum usuário simulado é aceito pela aplicação.
const credentials = { email: ' motorista@example.test ', senha: ' senha-de-teste ' }
const session = sessionFor()
const respond = (status, body) => async () => Response.json(body, { status })

test('campos obrigatórios e e-mail inválido impedem formulário válido', () => {
  assert.deepEqual(validateLogin({ email: '', senha: '' }), {
    email: 'Informe seu e-mail.', senha: 'Informe sua senha.',
  })
  assert.equal(validateLogin({ email: 'email-invalido', senha: 'teste' }).email, 'Informe um e-mail válido.')
  assert.equal(validateLogin({ email: '   ', senha: '   ' }).senha, 'Informe sua senha.')
  assert.deepEqual(validateLogin(credentials), {})
})

test('POST usa o endpoint e o payload combinados sem alterar a senha', async () => {
  let received
  const result = await login(credentials, {
    baseUrl: 'https://api.example.test/',
    fetcher: async (url, options) => {
      received = { url, options }
      return Response.json(session)
    },
  })
  assert.equal(received.url, 'https://api.example.test/auth/login')
  assert.equal(received.options.method, 'POST')
  assert.equal(received.options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(received.options.body), { email: 'motorista@example.test', senha: credentials.senha })
  assert.deepEqual(result, session)
})

test('credenciais inválidas sempre usam mensagem genérica, sem revelar o campo', async () => {
  await assert.rejects(login(credentials, {
    fetcher: respond(401, { erro: 'E-mail não encontrado' }),
  }), { message: INVALID_CREDENTIALS })
})

test('mensagem de usuário inativo vem do campo erro do backend', async () => {
  await assert.rejects(login(credentials, {
    fetcher: respond(403, { erro: 'Seu acesso está desativado.' }),
  }), { message: 'Seu acesso está desativado.' })
})

for (const status of [404, 408, 500, 502, 503]) {
  test('HTTP ' + status + ' é indisponibilidade, sem criar sessão', async () => {
    await assert.rejects(login(credentials, { fetcher: respond(status, session) }), { message: SERVICE_UNAVAILABLE })
  })
}

test('erro de rede mostra indisponibilidade', async () => {
  await assert.rejects(login(credentials, { fetcher: async () => { throw new TypeError('Failed to fetch') } }), {
    message: SERVICE_UNAVAILABLE,
  })
})

test('timeout cancela a requisição e mostra indisponibilidade', async () => {
  let aborted = false
  const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')) }, { once: true })
  })
  await assert.rejects(login(credentials, { fetcher, timeoutMs: 10 }), { message: SERVICE_UNAVAILABLE })
  assert.equal(aborted, true)
})

test('corpo não JSON jamais indica sucesso', async () => {
  await assert.rejects(login(credentials, { fetcher: async () => new Response('<html>Erro</html>') }), {
    message: SERVICE_UNAVAILABLE,
  })
})

test('corpo com erro em HTTP 200 é rejeitado mesmo contendo token', async () => {
  await assert.rejects(login(credentials, { fetcher: respond(200, { ...session, erro: 'Acesso desativado' }) }), {
    message: 'Acesso desativado',
  })
})

test('respostas incompletas e erros desconhecidos jamais indicam sucesso', () => {
  for (const data of [null, {}, { token: 'x' }, { ...session, nome: '' }, { ...session, perfil: 1 }, { ...session, erro: true }]) {
    assert.throws(() => parseLoginResponse(data), { message: SERVICE_UNAVAILABLE })
  }
})

test('perfil desconhecido não cria sessão mesmo em uma resposta HTTP 200', () => {
  assert.throws(() => parseLoginResponse({ ...session, perfil: 'OUTRO' }), {
    message: 'Não foi possível identificar seu perfil de acesso.',
  })
})

test('JWT expirado, malformado ou com perfil diferente não cria sessão', () => {
  assert.throws(() => parseLoginResponse(sessionFor('GESTOR', -1)), { message: SESSION_EXPIRED })
  assert.throws(() => parseLoginResponse({ ...session, token: 'token-invalido' }), { message: SERVICE_UNAVAILABLE })
  assert.throws(() => parseLoginResponse({ ...session, token: tokenFor('MOTORISTA') }), { message: SERVICE_UNAVAILABLE })
})

test('JWT usa perfil como claim e mantém compatibilidade com tokens role anteriores', () => {
  for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    assert.equal(parseLoginResponse(sessionFor(profile)).perfil, profile)
  }
  const legacy = { ...session, token: tokenFor('GESTOR', 3600, { perfil: undefined, role: 'GESTOR' }) }
  assert.equal(parseLoginResponse(legacy).perfil, 'GESTOR')
})

test('outras falhas preservam erro do backend e possuem fallback', async () => {
  await assert.rejects(login(credentials, { fetcher: respond(429, { erro: 'Tente novamente mais tarde.' }) }), {
    message: 'Tente novamente mais tarde.',
  })
  await assert.rejects(login(credentials, { fetcher: respond(400, {}) }), {
    message: 'Não foi possível entrar. Tente novamente.',
  })
})

test('sessão pode ser restaurada após recarregar; não contém senha e pode ser encerrada', () => {
  const data = new Map()
  globalThis.window = { sessionStorage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  } }
  try {
    assert.equal(readSession(), null)
    saveSession(session)
    assert.deepEqual(readSession(), session)
    assert.equal(data.get(SESSION_KEY).includes('senha'), false)
    clearSession()
    assert.equal(readSession(), null)
    data.set(SESSION_KEY, '{invalid-json')
    assert.equal(readSession(), null)
    data.set(SESSION_KEY, JSON.stringify({ token: 'incompleto' }))
    assert.equal(readSession(), null)
    data.set(SESSION_KEY, JSON.stringify(sessionFor('GESTOR', -1)))
    assert.equal(readSession(), null)
  } finally {
    delete globalThis.window
  }
})
