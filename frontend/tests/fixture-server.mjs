// Somente para verificação local da interface, nunca é importado pelo frontend.
// Executar: node tests/fixture-server.mjs
// Em outro terminal: API_PROXY_TARGET=http://127.0.0.1:4301 npm run dev -- --port 5174
import { createServer } from 'node:http'
import { sessionFor } from './fixtures.mjs'

const profiles = {
  administrador: 'ADMINISTRADOR', gestor: 'GESTOR', solicitante: 'SOLICITANTE',
  motorista: 'MOTORISTA', atendente: 'ATENDENTE_SVO', equipe: 'EQUIPE_SVO',
}
let loginRequests = 0

const server = createServer((request, response) => {
  const send = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(body))
  }
  if (request.url === '/stats') return send(200, { loginRequests })
  if (request.method !== 'POST' || request.url !== '/auth/login') return send(404, {})
  loginRequests++
  let body = ''
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    let data
    try { data = JSON.parse(body) } catch { return send(400, { erro: 'Requisição inválida' }) }
    const scenario = data.email?.split('@')[0]
    if (!data.email || !data.senha) return send(400, { erro: 'Informe e-mail e senha.' })
    if (scenario === 'inativo') return send(403, { erro: 'Seu acesso está desativado.' })
    if (scenario === 'indisponivel') return send(503, { erro: 'Indisponível' })
    if (scenario === 'incompleto') return send(200, { nome: 'Resposta sem token' })
    if (scenario === 'erro200') return send(200, { ...sessionFor(), erro: 'Seu acesso está desativado.' })
    if (scenario === 'expirado') return send(200, sessionFor('GESTOR', -1))
    if (scenario === 'expira') return send(200, sessionFor('GESTOR', 5))
    if (scenario === 'timeout') return // O cliente deve cancelar após 15 segundos.
    if (scenario === 'lento') return setTimeout(() => send(401, { erro: 'E-mail ou senha inválidos' }), 3000)
    if (profiles[scenario] && data.senha === 'teste') return send(200, sessionFor(profiles[scenario]))
    send(401, { erro: 'E-mail ou senha inválidos' })
  })
})

server.listen(4301, '127.0.0.1', () => {
  console.info('API de fixtures em http://127.0.0.1:4301 — somente testes, sem usuários reais.')
})
