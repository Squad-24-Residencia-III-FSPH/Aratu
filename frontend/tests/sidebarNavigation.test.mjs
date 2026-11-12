import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'

function getLabels(navigation) {
  return [
    ...navigation.topItems,
    ...navigation.sections.flatMap((section) => section.items),
    ...navigation.footerItems,
  ].map((item) => item.label)
}

test('ADMINISTRADOR recebe o menu administrativo e Ajuda compartilhada', () => {
  const navigation = getSidebarNavigation('ADMINISTRADOR')

  assert.deepEqual(getLabels(navigation), [
    'Início',
    'Usuários',
    'Perfis e Permissões',
    'Veículos',
    'Manutenção',
    'Abastecimentos',
    'Motoristas',
    'Auditoria',
    'Configurações',
    'Ajuda',
  ])
  assert.deepEqual(
    navigation.topItems
      .filter((item) => item.behavior === 'link')
      .map(({ label, path }) => ({ label, path })),
    [
      { label: 'Usuários', path: '/administracao/usuarios' },
      { label: 'Perfis e Permissões', path: '/administracao/perfis' },
      { label: 'Veículos', path: '/veiculos' },
      { label: 'Manutenção', path: '/maintenance-orders' },
      { label: 'Abastecimentos', path: '/abastecimentos' },
      { label: 'Motoristas', path: '/motoristas' },
    ],
  )
  assert.equal(navigation.topItems[0].behavior, 'static')
  assert.equal(navigation.topItems[4].behavior, 'link')
  assert.equal(navigation.topItems[5].behavior, 'link')
  assert.equal(navigation.topItems[6].behavior, 'link')
  assert.equal(navigation.topItems[7].behavior, 'static')
  assert.equal(navigation.topItems[8].behavior, 'static')
  assert.equal(navigation.footerItems[0].behavior, 'static')
  assert.equal(navigation.showDividerAfterTop, false)
})

test('GESTOR mantém os itens, grupos e Ajuda do menu operacional', () => {
  const navigation = getSidebarNavigation('GESTOR')

  assert.deepEqual(getLabels(navigation), [
    'Início',
    'Solicitações',
    'Viagens',
    'Confirmar viagens',
    'Veículos',
    'Motoristas',
    'Tipos de serviço',
    'Manutenção',
    'Abastecimentos',
    'Documentos',
    'Multas e Infrações',
    'Dashboard',
    'Relatórios',
    'Auditoria',
    'Ajuda',
  ])
  assert.deepEqual(navigation.sections.map((section) => section.label), [
    'OPERAÇÃO',
    'FROTA',
    'CONTROLE',
    'GESTÃO',
  ])
  const vehicles = navigation.sections
    .flatMap((section) => section.items)
    .find((item) => item.label === 'Veículos')
  assert.deepEqual(
    { behavior: vehicles.behavior, path: vehicles.path },
    { behavior: 'link', path: '/veiculos' },
  )
  const drivers = navigation.sections.flatMap((section) => section.items).find((item) => item.label === 'Motoristas')
  assert.deepEqual({ behavior: drivers.behavior, path: drivers.path }, { behavior: 'link', path: '/motoristas' })
  const maintenance = navigation.sections.flatMap((section) => section.items).find((item) => item.label === 'Manutenção')
  assert.deepEqual({ behavior: maintenance.behavior, path: maintenance.path }, { behavior: 'link', path: '/maintenance-orders' })
  const fuelings = navigation.sections.flatMap((section) => section.items).find((item) => item.label === 'Abastecimentos')
  assert.deepEqual({ behavior: fuelings.behavior, path: fuelings.path }, { behavior: 'link', path: '/abastecimentos' })
  assert.ok(
    [...navigation.topItems, ...navigation.sections.flatMap((section) => section.items), ...navigation.footerItems]
      .filter((item) => !['Veículos', 'Motoristas', 'Manutenção', 'Abastecimentos'].includes(item.label))
      .every((item) => item.behavior === 'button'),
  )
  assert.equal(navigation.showDividerAfterTop, true)
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

test('somente GESTOR e ADMINISTRADOR recebem o atalho de abastecimentos', () => {
  for (const profile of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Abastecimentos'), false)
  }
  for (const profile of ['GESTOR', 'ADMINISTRADOR']) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Abastecimentos'), true)
  }
})

test('somente MOTORISTA recebe o atalho Minhas viagens apontando para a própria home', () => {
  const driverNav = getSidebarNavigation('MOTORISTA')
  const myTrips = driverNav.sections
    .flatMap((section) => section.items)
    .find((item) => item.label === 'Minhas viagens')
  assert.deepEqual(
    { behavior: myTrips?.behavior, path: myTrips?.path },
    { behavior: 'link', path: '/viagens/minhas' },
  )
  for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.equal(getLabels(getSidebarNavigation(profile)).includes('Minhas viagens'), false)
  }
})

test('SOLICITANTE recebe links funcionais para Minhas Solicitações e Nova Solicitação', () => {
  const solicitanteNav = getSidebarNavigation('SOLICITANTE')
  assert.deepEqual(
    solicitanteNav.topItems.map(({ label, behavior, path }) => ({ label, behavior, path })),
    [
      { label: 'Início', behavior: 'link', path: '/solicitacoes/minhas' },
      { label: 'Nova Solicitação', behavior: 'link', path: '/solicitacoes/nova' },
      { label: 'Minhas Solicitações', behavior: 'link', path: '/solicitacoes/minhas' },
    ],
  )
})
