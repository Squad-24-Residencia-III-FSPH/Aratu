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
    ],
  )
  assert.equal(navigation.topItems[0].behavior, 'static')
  assert.equal(navigation.topItems[5].behavior, 'static')
  assert.equal(navigation.topItems[6].behavior, 'static')
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
    'Abastecimento',
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
  assert.ok(
    [...navigation.topItems, ...navigation.sections.flatMap((section) => section.items), ...navigation.footerItems]
      .filter((item) => !['Veículos', 'Manutenção'].includes(item.label))
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
