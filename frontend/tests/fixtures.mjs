import { createHmac } from 'node:crypto'

// JWT assinado apenas para testes; nunca usado pela aplicação ou pelo backend.
export function tokenFor(perfil = 'GESTOR', seconds = 3600, claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    id: 1, perfil, exp: Math.floor(Date.now() / 1000) + seconds, ...claims,
  })).toString('base64url')
  const signature = createHmac('sha256', 'aratu-fixture-only').update(header + '.' + payload).digest('base64url')
  return header + '.' + payload + '.' + signature
}

export function sessionFor(perfil = 'GESTOR', seconds = 3600) {
  return { token: tokenFor(perfil, seconds), nome: 'Pessoa de teste', perfil }
}
