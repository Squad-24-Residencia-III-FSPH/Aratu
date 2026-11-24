import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'

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
  for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    const items = allItems(getSidebarNavigation(profile))
    assert.ok(items.length > 0, `perfil ${profile} deve ter itens`)
    for (const item of items) {
      assert.equal(item.behavior, 'link', `${profile}: ${item.label} deve ser link`)
      assert.ok(item.path && item.path.startsWith('/'), `${profile}: ${item.label} deve ter destino`)
    }
    assert.equal(items.some((item) => item.label === 'Ajuda' || item.label === 'Configurações' || item.label === 'Viagens'), false)
  }
  assert.deepEqual(allItems(getSidebarNavigation(null)), [])
})

test('links SVO, Dashboard e Agenda aparecem somente para os perfis autorizados em cada tela', () => {
  for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
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
      items.some((item) => item.path === '/frota/dashboard'),
      profile === 'GESTOR' || profile === 'ADMINISTRADOR',
    )
    assert.equal(items.some((item) => item.path === '/viagens/agenda'), profile === 'GESTOR')
  }
})

test('ADMINISTRADOR recebe menu administrativo completo com Documentos, Multas, SVO, Dashboard e Auditoria', () => {
  const navigation = getSidebarNavigation('ADMINISTRADOR')

  assert.deepEqual(getLabels(navigation), [
    'Início',
    'Usuários',
    'Perfis e Permissões',
    'Tipos de serviço',
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

test('GESTOR mantém os grupos operacionais e liga Agenda, Documentos, Multas, SVO e Auditoria', () => {
  const navigation = getSidebarNavigation('GESTOR')

  assert.deepEqual(getLabels(navigation), [
    'Início',
    'Analisar solicitações',
    'Agenda de viagens',
    'Confirmar viagens',
    'Solicitações SVO',
    'Acompanhamento de ordens',
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
  assert.equal(byLabel.get('Documentos')?.path, '/vehicle-documents')
  assert.equal(byLabel.get('Multas e Infrações')?.path, '/multas')
  assert.equal(byLabel.get('Solicitações SVO')?.path, '/svo/solicitacoes')
  assert.equal(byLabel.get('Auditoria')?.path, '/auditoria')
  assert.equal(byLabel.get('Dashboard')?.path, '/frota/dashboard')
  assert.notEqual(byLabel.get('Solicitações SVO')?.icon, byLabel.get('Analisar solicitações')?.icon)
  assert.notEqual(byLabel.get('Solicitações SVO')?.icon, byLabel.get('Acompanhamento de ordens')?.icon)
  assert.equal(navigation.showDividerAfterTop, true)
})

test('SOLICITANTE navega direto para a rota canônica e abre Nova Solicitação via query param', () => {
  const navigation = getSidebarNavigation('SOLICITANTE')
  assert.deepEqual(
    navigation.topItems.map(({ label, behavior, path }) => ({ label, behavior, path })),
    [
      { label: 'Início', behavior: 'link', path: '/solicitacoes/minhas' },
      { label: 'Nova Solicitação', behavior: 'link', path: '/solicitacoes/minhas?nova=1' },
      { label: 'Minhas Solicitações', behavior: 'link', path: '/solicitacoes/minhas' },
    ],
  )
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

test('somente GESTOR recebe o atalho de análise de solicitações', () => {
  for (const profile of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Analisar solicitações'), false)
  }
  assert.equal(getLabels(getSidebarNavigation('GESTOR')).includes('Analisar solicitações'), true)
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

test('Confirmar viagens aponta para a página e fica restrito ao GESTOR', () => {
  const gestorNav = getSidebarNavigation('GESTOR')
  const confirmation = gestorNav.sections.flatMap((section) => section.items).find((item) => item.label === 'Confirmar viagens')
  assert.deepEqual({ behavior: confirmation?.behavior, path: confirmation?.path }, {
    behavior: 'link', path: '/viagens/confirmacao',
  })
  for (const profile of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Confirmar viagens'), false)
  }
})
