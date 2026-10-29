import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { PROFILE_ACCESS_DENIED_MESSAGE } from '../src/services/profileService.ts'

const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  server: { middlewareMode: true },
  appType: 'custom',
})
const { ProfilePermissionsView } = await vite.ssrLoadModule(
  '/src/pages/profilePermissionsPage/ProfilePermissionsPage.tsx',
)

after(async () => {
  await vite.close()
})

const profiles = [
  { id: '1', profile: 'ADMINISTRADOR', name: 'ADMINISTRADOR', description: 'Administração do sistema' },
  { id: '2', profile: 'GESTOR', name: 'GESTOR', description: 'Gestão de frota' },
  { id: '3', profile: 'SOLICITANTE', name: 'SOLICITANTE', description: 'Solicitações internas' },
  { id: '4', profile: 'MOTORISTA', name: 'MOTORISTA', description: 'Viagens atribuídas' },
  { id: '5', profile: 'ATENDENTE_SVO', name: 'ATENDENTE_SVO', description: 'Atendimento SVO' },
  { id: '6', profile: 'EQUIPE_SVO', name: 'EQUIPE_SVO', description: 'Equipe de coleta SVO' },
]

function renderPageState(profilesState) {
  return renderToStaticMarkup(createElement(ProfilePermissionsView, {
    profilesState,
    onRetry: () => {},
  }))
}

test('renderiza o estado de carregamento acessível na página completa', () => {
  const markup = renderPageState({ status: 'loading' })

  assert.match(markup, /Carregando perfis/)
  assert.match(markup, /aria-busy="true"/)
  assert.match(markup, /Perfis e Permissões/)
  assert.match(markup, /Matriz de Permissões por Módulo/)
})

test('renderiza os seis perfis reais e a matriz provisória no estado de sucesso', () => {
  const markup = renderPageState({ status: 'success', profiles })

  for (const label of [
    'Administrador do Sistema',
    'Gestor de Frota',
    'Solicitante Interno',
    'Motorista',
    'Atendente SVO',
    'Equipe SVO',
  ]) {
    assert.ok(markup.includes(label), `O perfil ${label} deve aparecer na página.`)
  }
  assert.match(markup, /A definir/)
  assert.match(markup, /role="region"/)
  assert.match(markup, /tabindex="0"/)
  assert.match(markup, /aria-describedby="[^"]+-matrix-help"/)
  assert.match(markup, /Representação provisória/)
})

test('renderiza erro com ação de tentar novamente na página completa', () => {
  const markup = renderPageState({ status: 'error' })

  assert.match(markup, /Não foi possível carregar os perfis/)
  assert.match(markup, /Tentar novamente/)
  assert.match(markup, /role="alert"/)
})

test('renderiza mensagem amigável de acesso negado para HTTP 403', () => {
  const markup = renderPageState({ status: 'forbidden' })

  assert.ok(markup.includes(PROFILE_ACCESS_DENIED_MESSAGE))
  assert.match(markup, /role="alert"/)
})
