import { appendFileSync } from 'node:fs'
const { FRONTEND_URL, API_BASE_URL, BOOTSTRAP_DEMO, DEMO_PASSWORD } = process.env
const frontend = await fetch(FRONTEND_URL, { signal: AbortSignal.timeout(30_000) })
if (!frontend.ok || !(await frontend.text()).includes('<div id="root">')) throw new Error('Frontend não retornou a SPA esperada.')
const ready = await fetch(`${API_BASE_URL}/health/ready`, { headers: { Origin: FRONTEND_URL }, signal: AbortSignal.timeout(120_000) })
if (!ready.ok || ready.headers.get('access-control-allow-origin') !== FRONTEND_URL) throw new Error('Prontidão ou CORS inválido para o frontend publicado.')
const roles = ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']
if (BOOTSTRAP_DEMO === 'true') {
  for (const role of roles) {
    const login = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role.toLowerCase()}.demo@example.test`, senha: DEMO_PASSWORD }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await login.json()
    if (!login.ok || data.perfil !== role || typeof data.token !== 'string') throw new Error(`Login de homologação falhou para ${role}.`)
  }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `### Homologação verificada\n\nFrontend: ${FRONTEND_URL}\n\nAPI e CORS: aprovados.\n\n${BOOTSTRAP_DEMO === 'true' ? 'Seis logins fictícios aprovados.' : 'Bootstrap não solicitado; contas preservadas.'}\n`)
