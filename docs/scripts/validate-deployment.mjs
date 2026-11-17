const required = ['NEON_DATABASE_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID', 'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT', 'API_BASE_URL', 'FRONTEND_URL']
function readUrl(name) {
  try { return new URL(process.env[name]) } catch { throw new Error(`URL inválida na configuração ${name}.`) }
}
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Configuração ausente: ${name}`)
}
for (const name of ['API_BASE_URL', 'FRONTEND_URL']) {
  const url = readUrl(name)
  if (url.protocol !== 'https:' || url.origin !== process.env[name]) {
    throw new Error(`${name} deve conter somente a origem HTTPS, sem barra final.`)
  }
}
if (!/^[a-z0-9-]+$/.test(process.env.CLOUDFLARE_PAGES_PROJECT)) throw new Error('Nome de projeto Pages inválido.')
if (!/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('Account ID Cloudflare inválido.')
if (!/^srv-[a-z0-9]+$/.test(process.env.RENDER_SERVICE_ID)) throw new Error('Service ID Render inválido.')
const databaseUrl = readUrl('NEON_DATABASE_URL')
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !databaseUrl.hostname.endsWith('.neon.tech')
  || databaseUrl.hostname.includes('-pooler.') || !['require', 'verify-full'].includes(databaseUrl.searchParams.get('sslmode'))) {
  throw new Error('Use a conexão direta TLS do Neon para executar migrations.')
}
if (process.env.BOOTSTRAP_DEMO === 'true' && (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12
  || Buffer.byteLength(process.env.DEMO_PASSWORD, 'utf8') > 72)) throw new Error('Configure DEMO_PASSWORD com 12 caracteres ou mais e até 72 bytes.')
process.stdout.write('Configuração de homologação validada sem exibir credenciais.\n')
