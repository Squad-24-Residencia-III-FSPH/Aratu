import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'

const PROFILES = ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']

function allItems(navigation) {
  return [
    ...navigation.topItems,
    ...navigation.sections.flatMap((section) => section.items),
  ]
}

test('cada item de navegação executa uma rota ou uma ação identificável', () => {
  for (const profile of PROFILES) {
    const navigation = getSidebarNavigation(profile)
    for (const item of allItems(navigation)) {
      assert.ok(
        item.behavior === 'link' ? typeof item.path === 'string' : typeof item.action === 'string',
        `${profile}: ${item.label} precisa de uma rota ou ação real`,
      )
    }
    for (const item of navigation.mobileItems) {
      assert.equal(item.behavior, 'link')
      assert.equal(typeof item.path, 'string')
    }
    assert.ok(navigation.mobileItems.length <= 5)
  }
})

test('links operacionais aparecem apenas nos perfis autorizados', () => {
  const linksFor = (profile) => allItems(getSidebarNavigation(profile)).map((item) => item.path)
  for (const profile of PROFILES) {
    assert.equal(linksFor(profile).includes('/svo/ordens'), profile === 'EQUIPE_SVO')
    assert.equal(linksFor(profile).includes('/svo/acompanhamento'), profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR')
    assert.equal(linksFor(profile).includes('/svo/solicitacoes'), profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR')
    assert.equal(linksFor(profile).includes('/svo/equipes'), profile === 'GESTOR' || profile === 'ADMINISTRADOR')
    assert.equal(linksFor(profile).includes('/frota/solicitacoes/analise'), profile === 'GESTOR' || profile === 'ADMINISTRADOR')
    assert.equal(linksFor(profile).includes('/viagens/agenda'), profile === 'GESTOR' || profile === 'ADMINISTRADOR')
    assert.equal(linksFor(profile).includes('/viagens/confirmacao'), profile === 'GESTOR' || profile === 'ADMINISTRADOR')
  }
})

test('SOLICITANTE recebe ação para criar pedido e destinos reais no celular', () => {
  const navigation = getSidebarNavigation('SOLICITANTE')
  const createAction = allItems(navigation).find((item) => item.label === 'Nova solicitação')

  assert.deepEqual(
    { behavior: createAction?.behavior, action: createAction?.action },
    { behavior: 'action', action: 'open-request' },
  )
  assert.equal(navigation.primaryAction?.action, 'open-request')
  assert.deepEqual(navigation.mobileItems.map(({ path }) => path), ['/solicitacoes/minhas'])
})

test('controles sem destino não são publicados e módulos conectados têm rotas reais', () => {
  for (const profile of PROFILES) {
    const labels = allItems(getSidebarNavigation(profile)).map(({ label }) => label)
    assert.equal(labels.includes('Configurações'), false)
    assert.equal(labels.includes('Ajuda'), false)
    assert.equal(labels.includes('Documentos'), profile === 'GESTOR' || profile === 'ADMINISTRADOR')
    assert.equal(labels.includes('Multas e Infrações'), profile === 'GESTOR' || profile === 'ADMINISTRADOR')
  }
  assert.deepEqual(allItems(getSidebarNavigation(null)), [])
})

test('menu mobile mantém ações no grupo primário e dentro do limite de destinos', () => {
  const manager = getSidebarNavigation('GESTOR')
  const attendant = getSidebarNavigation('ATENDENTE_SVO')
  const driver = getSidebarNavigation('MOTORISTA')
  const team = getSidebarNavigation('EQUIPE_SVO')

  assert.deepEqual(manager.mobileItems.map(({ path }) => path), [
    '/frota/inicio', '/viagens/agenda', '/frota/solicitacoes/analise', '/viagens/confirmacao',
  ])
  assert.deepEqual(attendant.mobileItems.map(({ path }) => path), ['/svo/solicitacoes', '/svo/acompanhamento'])
  assert.deepEqual(driver.mobileItems.map(({ path }) => path), ['/viagens/minhas'])
  assert.deepEqual(team.mobileItems.map(({ path }) => path), ['/svo/ordens'])
})
