import { appendFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const { RENDER_API_KEY, RENDER_SERVICE_ID, GITHUB_SHA, API_BASE_URL } = process.env
const headers = { Authorization: `Bearer ${RENDER_API_KEY}`, 'Content-Type': 'application/json' }
const endpoint = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys`
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Render retornou HTTP ${response.status}. Consulte o painel do serviço.`)
  return response.json()
}
const deployment = await request(endpoint, { method: 'POST', body: JSON.stringify({ commitId: GITHUB_SHA }) })
if (!deployment.id) throw new Error('Render não retornou o identificador do deploy.')
const deadline = Date.now() + 15 * 60_000
let live = false
while (Date.now() < deadline) {
  const current = await request(`${endpoint}/${encodeURIComponent(deployment.id)}`)
  if (current.status === 'live') {
    if (current.commit?.id !== GITHUB_SHA) throw new Error('O commit publicado difere do commit aprovado.')
    live = true
    break
  }
  if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(current.status)) {
    throw new Error(`Deploy da API terminou com estado ${current.status}. Consulte o painel Render.`)
  }
  await delay(5_000)
}
if (!live) throw new Error('O deploy da API não concluiu dentro de 15 minutos.')
const ready = await fetch(`${API_BASE_URL}/health/ready`, { signal: AbortSignal.timeout(120_000) })
if (!ready.ok || (await ready.json()).status !== 'ready') throw new Error('API publicada sem prontidão do banco/schema.')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `### API publicada\n\nCommit: \`${GITHUB_SHA}\`\n\nDeploy: \`${deployment.id}\`\n\nURL: ${API_BASE_URL}\n`)
