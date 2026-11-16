import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'

function getAllItems(navigation) {
  return [
    ...navigation.topItems,
    ...navigation.sections.flatMap((section) => section.items),
    ...navigation.footerItems,
  ]
}

function getLabels(navigation) {
  return getAllItems(navigation).map((item) => item.label)
}

function findByLabel(navigation, label) {
  return getAllItems(navigation).find((item) => item.label === label)
}

test('links de ordens SVO aparecem somente para seus respectivos perfis', () => {
  for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    const navigation = getSidebarNavigation(profile)
    const items = [...navigation.topItems, ...navigation.sections.flatMap((section) => section.items)]

    assert.strictEqual(
      items.some((item) => item.path === '/svo/ordens'),
      profile === 'EQUIPE_SVO',
      `perfil ${profile}: visibilidade de /svo/ordens`,
    )
    assert.strictEqual(
      items.some((item) => item.path === '/svo/acompanhamento'),
      profile === 'ATENDENTE_SVO' || profile === 'GESTOR',
      `perfil ${profile}: visibilidade de /svo/acompanhamento`,
    )
  }
})

test('ADMINISTRADOR recebe o menu administrativo e Ajuda compartilhada', () => {
  const navigation = getSidebarNavigation('ADMINISTRADOR')

  assert.deepStrictEqual(getLabels(navigation), [
    'Início',
    'Usuários',
    'Perfis e Permissões',
    'Tipos de serviço',
    'Veículos',
    'Manutenção',
    'Abastecimentos',
    'Motoristas',
    'Auditoria',
    'Configurações',
    'Ajuda',
  ])

  assert.deepStrictEqual(
    navigation.topItems
      .filter((item) => item.behavior === 'link')
      .map(({ label, path }) => ({ label, path })),
    [
      { label: 'Usuários', path: '/administracao/usuarios' },
      { label: 'Perfis e Permissões', path: '/administracao/perfis' },
      { label: 'Tipos de serviço', path: '/tipos-de-servico' },
      { label: 'Veículos', path: '/veiculos' },
      { label: 'Manutenção', path: '/maintenance-orders' },
      { label: 'Abastecimentos', path: '/abastecimentos' },
      { label: 'Motoristas', path: '/motoristas' },
    ],
  )

  assert.strictEqual(navigation.topItems[0].behavior, 'static')
  assert.strictEqual(navigation.topItems[4].behavior, 'link')
  assert.strictEqual(navigation.topItems[5].behavior, 'link')
  assert.strictEqual(navigation.topItems[6].behavior, 'link')
  assert.strictEqual(navigation.topItems[7].behavior, 'link')
  assert.strictEqual(navigation.topItems[8].behavior, 'static')
  assert.strictEqual(navigation.topItems[9].behavior, 'static')
  assert.strictEqual(navigation.footerItems[0].behavior, 'static')
  assert.strictEqual(navigation.showDividerAfterTop, false)
})

test('GESTOR mantém os itens, grupos e Ajuda do menu operacional', () => {
  const navigation = getSidebarNavigation('GESTOR')

  assert.deepStrictEqual(getLabels(navigation), [
    'Início',
    'Solicitações',
    'Analisar solicitações',
    'Viagens',
    'Acompanhamento de ordens',
    'Confirmar viagens',
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
    'Ajuda',
  ])

  assert.deepStrictEqual(
    navigation.sections.map((section) => section.label),
    ['OPERAÇÃO', 'FROTA', 'CONTROLE', 'GESTÃO'],
  )

  const linkExpectations = [
    { label: 'Veículos', path: '/veiculos' },
    { label: 'Motoristas', path: '/motoristas' },
    { label: 'Agendar viagem', path: '/agendar-viagem' },
    { label: 'Analisar solicitações', path: '/frota/solicitacoes/analise' },
    { label: 'Manutenção', path: '/maintenance-orders' },
    { label: 'Abastecimentos', path: '/abastecimentos' },
    { label: 'Acompanhamento de ordens', path: '/svo/acompanhamento' },
  ]

  for (const expected of linkExpectations) {
    const item = findByLabel(navigation, expected.label)
    assert.ok(item, `item "${expected.label}" não encontrado no menu do GESTOR`)
    assert.deepStrictEqual(
      { behavior: item.behavior, path: item.path },
      { behavior: 'link', path: expected.path },
      `item "${expected.label}" com comportamento/path inesperado`,
    )
  }

  const linkLabels = new Set(linkExpectations.map((item) => item.label))
  const nonLinkItems = getAllItems(navigation).filter((item) => !linkLabels.has(item.label))

  for (const item of nonLinkItems) {
    assert.strictEqual(
      item.behavior,
      'button',
      `item "${item.label}" deveria ter behavior "button"`,
    )
  }

  assert.strictEqual(navigation.showDividerAfterTop, true)
})

test('somente perfis com leitura de veículos recebem o atalho no menu', () => {
  for (const profile of ['SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO']) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Veículos'),
      false,
      `perfil ${profile} não deveria ter "Veículos"`,
    )
  }
  for (const profile of ['GESTOR', 'ATENDENTE_SVO', 'ADMINISTRADOR']) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Veículos'),
      true,
      `perfil ${profile} deveria ter "Veículos"`,
    )
  }
  assert.strictEqual(getLabels(getSidebarNavigation(null)).includes('Veículos'), false)
})

test('somente GESTOR e ADMINISTRADOR recebem o atalho de abastecimentos', () => {
  for (const profile of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Abastecimentos'),
      false,
      `perfil ${profile} não deveria ter "Abastecimentos"`,
    )
  }
  for (const profile of ['GESTOR', 'ADMINISTRADOR']) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Abastecimentos'),
      true,
      `perfil ${profile} deveria ter "Abastecimentos"`,
    )
  }
})

test('somente GESTOR recebe o atalho de análise de solicitações', () => {
  for (const profile of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Analisar solicitações'),
      false,
      `perfil ${profile ?? 'null'} não deveria ter "Analisar solicitações"`,
    )
  }
  assert.strictEqual(
    getLabels(getSidebarNavigation('GESTOR')).includes('Analisar solicitações'),
    true,
  )
})

test('somente MOTORISTA recebe o atalho Minhas viagens apontando para a própria home', () => {
  const driverNav = getSidebarNavigation('MOTORISTA')
  const myTrips = findByLabel(driverNav, 'Minhas viagens')

  assert.ok(myTrips, 'item "Minhas viagens" não encontrado no menu do MOTORISTA')
  assert.deepStrictEqual(
    { behavior: myTrips.behavior, path: myTrips.path },
    { behavior: 'link', path: '/viagens/minhas' },
  )

  for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Minhas viagens'),
      false,
      `perfil ${profile ?? 'null'} não deveria ter "Minhas viagens"`,
    )
  }
})

test('Confirmar viagens aponta para a página e fica restrito ao GESTOR', () => {
  const gestorNav = getSidebarNavigation('GESTOR')
  const confirmation = findByLabel(gestorNav, 'Confirmar viagens')

  assert.ok(confirmation, 'item "Confirmar viagens" não encontrado no menu do GESTOR')
  assert.deepStrictEqual(
    { behavior: confirmation.behavior, path: confirmation.path },
    { behavior: 'link', path: '/viagens/confirmacao' },
  )

  for (const profile of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.strictEqual(
      getLabels(getSidebarNavigation(profile)).includes('Confirmar viagens'),
      false,
      `perfil ${profile ?? 'null'} não deveria ter "Confirmar viagens"`,
    )
  }
})
