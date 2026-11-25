import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'

const PROFILES = ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']

function allItems(navigation) {
  return [
    ...navigation.topItems,
    ...navigation.sections.flatMap((section) => section.items),
    ...navigation.footerItems,
  ]
}

function getLabels(navigation) {
  return allItems(navigation).map((item) => item.label)
}

test('todos os itens renderizados nos seis perfis são links ativos sem controles mortos', () => {
  for (const profile of PROFILES) {
    const navigation = getSidebarNavigation(profile)
    const items = allItems(navigation)
    assert.ok(items.length > 0, `perfil ${profile} deve ter itens`)
    for (const item of items) {
      assert.equal(item.behavior, 'link', `${profile}: ${item.label} deve ser link`)
      assert.ok(item.path && item.path.startsWith('/'), `${profile}: ${item.label} deve ter destino`)
    }
    for (const item of navigation.mobileItems) {
      assert.equal(item.behavior, 'link')
      assert.equal(typeof item.path, 'string')
    }
    assert.ok(navigation.mobileItems.length <= 5)
    assert.equal(items.some((item) => item.label === 'Ajuda' || item.label === 'Configurações' || item.label === 'Viagens'), false)
  }
  assert.deepEqual(allItems(getSidebarNavigation(null)), [])
})

test('links SVO, Equipes, Análise, Confirmação, Dashboard e Agenda aparecem somente para os perfis autorizados', () => {
  for (const profile of PROFILES) {
    const items = allItems(getSidebarNavigation(profile))
    assert.equal(items.some((item) => item.path === '/svo/ordens'), profile === 'EQUIPE_SVO')
    assert.equal(
      items.some((item) => item.path === '/svo/acompanhamento'),
      profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(
      items.some((item) => item.path === '/svo/solicitacoes'),
      profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(
      items.some((item) => item.path === '/svo/equipes'),
      profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(
      items.some((item) => item.path === '/frota/solicitacoes/analise'),
      profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(
      items.some((item) => item.path === '/viagens/confirmacao'),
      profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(
      items.some((item) => item.path === '/frota/dashboard'),
      profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(items.some((item) => item.path === '/viagens/agenda'), profile === 'GESTOR')
  }
})

test('ADMINISTRADOR recebe menu administrativo completo com supervisão, Equipes SVO, Documentos, Multas, Dashboard e Auditoria', () => {
  const navigation = getSidebarNavigation('ADMINISTRADOR')

  assert.deepEqual(getLabels(navigation), [
    'Início',
    'Usuários',
    'Perfis e Permissões',
    'Tipos de serviço',
    'Analisar solicitações',
    'Confirmar viagens',
    'Equipes e plantões',
    'Veículos',
    'Motoristas',
    'Manutenção',
    'Abastecimentos',
    'Documentos',
    'Multas e Infrações',
    'Solicitações SVO',
    'Acompanhamento de ordens',
    'Dashboard',
    'Relatórios',
    'Auditoria',
  ])
  assert.deepEqual(
    navigation.topItems.map(({ label, path }) => ({ label, path })),
    [
      { label: 'Início', path: '/administracao/usuarios' },
      { label: 'Usuários', path: '/administracao/usuarios' },
      { label: 'Perfis e Permissões', path: '/administracao/perfis' },
      { label: 'Tipos de serviço', path: '/tipos-de-servico' },
      { label: 'Analisar solicitações', path: '/frota/solicitacoes/analise' },
      { label: 'Confirmar viagens', path: '/viagens/confirmacao' },
      { label: 'Equipes e plantões', path: '/svo/equipes' },
      { label: 'Veículos', path: '/veiculos' },
      { label: 'Motoristas', path: '/motoristas' },
      { label: 'Manutenção', path: '/maintenance-orders' },
      { label: 'Abastecimentos', path: '/abastecimentos' },
      { label: 'Documentos', path: '/vehicle-documents' },
      { label: 'Multas e Infrações', path: '/multas' },
      { label: 'Solicitações SVO', path: '/svo/solicitacoes' },
      { label: 'Acompanhamento de ordens', path: '/svo/acompanhamento' },
      { label: 'Dashboard', path: '/frota/dashboard' },
      { label: 'Relatórios', path: '/relatorios' },
      { label: 'Auditoria', path: '/auditoria' },
    ],
  )
  assert.equal(navigation.showDividerAfterTop, false)
})

test('GESTOR mantém os grupos operacionais e liga Agenda, Equipes SVO, Documentos, Multas, SVO e Auditoria', () => {
  const navigation = getSidebarNavigation('GESTOR')

  assert.deepEqual(getLabels(navigation), [
    'Início',
    'Analisar solicitações',
    'Agenda de viagens',
    'Confirmar viagens',
    'Solicitações SVO',
    'Acompanhamento de ordens',
    'Equipes e plantões',
    'Veículos',
    'Motoristas',
    'Tipos de serviço',
    'Agendar viagem',
    'Manutenção',
    'Abastecimentos',
    'Documentos',
    'Multas e Infrações',
    'Dashboard',
    'Relatórios',
    'Auditoria',
  ])
  assert.deepEqual(navigation.sections.map((section) => section.label), [
    'OPERAÇÃO',
    'FROTA',
    'CONTROLE',
    'GESTÃO',
  ])
  const byLabel = new Map(allItems(navigation).map((item) => [item.label, item]))
  assert.equal(byLabel.get('Início')?.path, '/frota/inicio')
  assert.equal(byLabel.get('Agenda de viagens')?.path, '/viagens/agenda')
  assert.equal(byLabel.get('Equipes e plantões')?.path, '/svo/equipes')
  assert.equal(byLabel.get('Documentos')?.path, '/vehicle-documents')
  assert.equal(byLabel.get('Multas e Infrações')?.path, '/multas')
  assert.equal(byLabel.get('Solicitações SVO')?.path, '/svo/solicitacoes')
  assert.equal(byLabel.get('Auditoria')?.path, '/auditoria')
  assert.equal(byLabel.get('Dashboard')?.path, '/frota/dashboard')
  assert.notEqual(byLabel.get('Solicitações SVO')?.icon, byLabel.get('Analisar solicitações')?.icon)
  assert.notEqual(byLabel.get('Solicitações SVO')?.icon, byLabel.get('Acompanhamento de ordens')?.icon)
  assert.equal(navigation.showDividerAfterTop, true)
})

test('SOLICITANTE navega direto para a rota canônica, abre Nova Solicitação via query param e mantém ação móvel', () => {
  const navigation = getSidebarNavigation('SOLICITANTE')
  assert.deepEqual(
    navigation.topItems.map(({ label, behavior, path }) => ({ label, behavior, path })),
    [
      { label: 'Início', behavior: 'link', path: '/solicitacoes/minhas' },
      { label: 'Nova Solicitação', behavior: 'link', path: '/solicitacoes/minhas?nova=1' },
      { label: 'Minhas Solicitações', behavior: 'link', path: '/solicitacoes/minhas' },
    ],
  )
  assert.equal(navigation.primaryAction?.action, 'open-request')
  assert.deepEqual(navigation.mobileItems.map(({ path }) => path), ['/solicitacoes/minhas'])
  assert.equal(navigation.showDividerAfterTop, false)
})

test('ATENDENTE_SVO recebe Início, Solicitações SVO, Acompanhamento, Veículos e Relatórios', () => {
  const navigation = getSidebarNavigation('ATENDENTE_SVO')
  assert.deepEqual(
    allItems(navigation).map(({ label, path }) => ({ label, path })),
    [
      { label: 'Início', path: '/svo/solicitacoes' },
      { label: 'Solicitações SVO', path: '/svo/solicitacoes' },
      { label: 'Acompanhamento de ordens', path: '/svo/acompanhamento' },
      { label: 'Veículos', path: '/veiculos' },
      { label: 'Relatórios', path: '/relatorios' },
    ],
  )
})

test('somente perfis com leitura de veículos recebem o atalho no menu', () => {
  for (const profile of ['SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO']) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Veículos'), false)
  }
  for (const profile of ['GESTOR', 'ATENDENTE_SVO', 'ADMINISTRADOR']) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Veículos'), true)
  }
  assert.equal(getLabels(getSidebarNavigation(null)).includes('Veículos'), false)
})

test('somente GESTOR e ADMINISTRADOR recebem Documentos, Multas, Abastecimentos e Auditoria', () => {
  for (const label of ['Abastecimentos', 'Documentos', 'Multas e Infrações', 'Auditoria']) {
    for (const profile of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
      assert.equal(getLabels(getSidebarNavigation(profile)).includes(label), false, `${profile} não deve ver ${label}`)
    }
    for (const profile of ['GESTOR', 'ADMINISTRADOR']) {
      assert.equal(getLabels(getSidebarNavigation(profile)).includes(label), true, `${profile} deve ver ${label}`)
    }
  }
})

test('MOTORISTA e EQUIPE_SVO recebem apenas Início e a própria operação', () => {
  assert.deepEqual(
    allItems(getSidebarNavigation('MOTORISTA')).map(({ label, path }) => ({ label, path })),
    [
      { label: 'Início', path: '/viagens/minhas' },
      { label: 'Minhas viagens', path: '/viagens/minhas' },
    ],
  )
  assert.deepEqual(
    allItems(getSidebarNavigation('EQUIPE_SVO')).map(({ label, path }) => ({ label, path })),
    [
      { label: 'Início', path: '/svo/ordens' },
      { label: 'Ordens da equipe', path: '/svo/ordens' },
    ],
  )
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
