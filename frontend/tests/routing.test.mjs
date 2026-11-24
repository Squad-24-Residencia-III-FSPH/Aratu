import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDIT_LOGS_ALIAS_PATH, resolveRoute, SOLICITANTE_ALIAS_PATH } from '../src/routing/routeDecision.ts'
import { GESTOR_DASHBOARD_PATH, PROFILE_PERMISSIONS_PATH, resolveProfile } from '../src/auth/profiles.ts'
import { REQUEST_ANALYSIS_PATH } from '../src/requests/requestAccess.ts'
import { sessionFor } from './fixtures.mjs'
import { TRIP_CONFIRMATION_PATH } from '../src/trips/tripConfirmationTypes.ts'
import { VEHICLE_DOCUMENTS_PATH } from '../src/types/vehicleDocument.ts'
import { FINES_PATH } from '../src/types/fine.ts'
import { SVO_OCCURRENCES_PATH } from '../src/types/svoOccurrence.ts'
import { AUDIT_LOGS_PATH } from '../src/types/auditLog.ts'
import { TRIP_AGENDA_PATH } from '../src/types/dashboard.ts'

const destinations = [
  ['ADMINISTRADOR', '/administracao/usuarios'],
  ['GESTOR', '/frota/inicio'],
  ['SOLICITANTE', '/solicitacoes/minhas'],
  ['MOTORISTA', '/viagens/minhas'],
  ['ATENDENTE_SVO', '/svo/solicitacoes'],
  ['EQUIPE_SVO', '/svo/ordens'],
]

const vehicleReaders = new Set(['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'])
const svoOccurrenceReaders = new Set(['ATENDENTE_SVO', 'ADMINISTRADOR', 'GESTOR'])
const svoOrderReaders = new Set(['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'])
const managementRoles = new Set(['GESTOR', 'ADMINISTRADOR'])
const VEHICLES_PATH = '/veiculos'
const DRIVERS_PATH = '/motoristas'
const FUELINGS_PATH = '/abastecimentos'

test('acompanhamento SVO libera leitura para atendente, gestor e administrador', () => {
  for (const [profile, home] of destinations) {
    assert.deepEqual(resolveRoute(sessionFor(profile), '/svo/acompanhamento'), svoOrderReaders.has(profile)
      ? { kind: 'svo-orders', profile } : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, '/svo/acompanhamento'), { kind: 'redirect', to: '/login' })
})

test('dashboard libera consulta para gestor e administrador, barrando os demais perfis', () => {
  for (const [profile, home] of destinations) {
    assert.deepEqual(
      resolveRoute(sessionFor(profile), GESTOR_DASHBOARD_PATH),
      managementRoles.has(profile) ? { kind: 'dashboard', profile } : { kind: 'redirect', to: home },
    )
  }
  assert.deepEqual(resolveRoute(null, GESTOR_DASHBOARD_PATH), { kind: 'redirect', to: '/login' })
})

test('agenda de viagens é restrita ao GESTOR; demais perfis voltam à própria home', () => {
  assert.deepEqual(resolveRoute(sessionFor('GESTOR'), TRIP_AGENDA_PATH), {
    kind: 'trip-agenda',
    profile: 'GESTOR',
  })
  for (const [profile, home] of destinations) {
    if (profile === 'GESTOR') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), TRIP_AGENDA_PATH), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, TRIP_AGENDA_PATH), { kind: 'redirect', to: '/login' })
})

for (const [profile, path] of destinations) {
  test(profile + ' vai para a própria tela e não pode abrir as demais', () => {
    const session = sessionFor(profile)
    assert.deepEqual(resolveRoute(session, '/login'), { kind: 'redirect', to: path })
    assert.deepEqual(resolveRoute(session, path), { kind: 'home', profile })
    assert.deepEqual(
      resolveRoute(session, PROFILE_PERMISSIONS_PATH),
      profile === 'ADMINISTRADOR'
        ? { kind: 'profile-permissions', profile }
        : { kind: 'redirect', to: path },
    )
    for (const [, otherPath] of destinations) {
      if (otherPath === path || otherPath === SVO_OCCURRENCES_PATH) continue
      assert.deepEqual(resolveRoute(session, otherPath), { kind: 'redirect', to: path })
    }
    assert.deepEqual(
      resolveRoute(session, VEHICLES_PATH),
      vehicleReaders.has(profile)
        ? { kind: 'vehicles', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, DRIVERS_PATH),
      managementRoles.has(profile)
        ? { kind: 'drivers', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, FUELINGS_PATH),
      managementRoles.has(profile)
        ? { kind: 'fuelings', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, VEHICLE_DOCUMENTS_PATH),
      managementRoles.has(profile)
        ? { kind: 'vehicle-documents', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, FINES_PATH),
      managementRoles.has(profile)
        ? { kind: 'fines', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, SVO_OCCURRENCES_PATH),
      !svoOccurrenceReaders.has(profile)
        ? { kind: 'redirect', to: path }
        : profile === 'ATENDENTE_SVO'
          ? { kind: 'home', profile }
          : { kind: 'svo-occurrences', profile },
    )
    assert.deepEqual(
      resolveRoute(session, AUDIT_LOGS_PATH),
      managementRoles.has(profile)
        ? { kind: 'audit-logs', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, AUDIT_LOGS_ALIAS_PATH),
      managementRoles.has(profile)
        ? { kind: 'redirect', to: AUDIT_LOGS_PATH, preserveSearch: true }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(resolveRoute(session, REQUEST_ANALYSIS_PATH), profile === 'GESTOR'
      ? { kind: 'request-analysis', profile: 'GESTOR' }
      : { kind: 'redirect', to: path })
  })
}

test('alias /minhas-solicitacoes aplica a mesma guarda da rota canônica', () => {
  assert.deepEqual(
    resolveRoute(sessionFor('SOLICITANTE'), SOLICITANTE_ALIAS_PATH),
    { kind: 'redirect', to: '/solicitacoes/minhas', preserveSearch: true },
  )
  for (const [profile, home] of destinations) {
    if (profile === 'SOLICITANTE') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), SOLICITANTE_ALIAS_PATH), { kind: 'redirect', to: home })
    assert.deepEqual(resolveRoute(sessionFor(profile), '/solicitacoes/minhas'), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SOLICITANTE_ALIAS_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(null, '/solicitacoes/minhas'), { kind: 'redirect', to: '/login' })
})

test('sem login e após logout, todas as rotas internas voltam ao login', () => {
  for (const [, path] of [
    ...destinations,
    ['ADMINISTRADOR', PROFILE_PERMISSIONS_PATH],
    ['GESTOR', VEHICLES_PATH],
    ['ADMINISTRADOR', DRIVERS_PATH],
    ['GESTOR', FUELINGS_PATH],
    ['GESTOR', VEHICLE_DOCUMENTS_PATH],
    ['GESTOR', FINES_PATH],
    ['GESTOR', AUDIT_LOGS_PATH],
    ['GESTOR', AUDIT_LOGS_ALIAS_PATH],
    ['GESTOR', TRIP_AGENDA_PATH],
    ['GESTOR', GESTOR_DASHBOARD_PATH],
    ['SOLICITANTE', SOLICITANTE_ALIAS_PATH],
  ]) {
    assert.deepEqual(resolveRoute(null, path), { kind: 'redirect', to: '/login' })
  }
  assert.deepEqual(resolveRoute(null, '/login'), { kind: 'login' })
})

test('token expirado e sessão adulterada não abrem telas internas', () => {
  assert.deepEqual(resolveRoute(sessionFor('MOTORISTA', -1), '/viagens/minhas'), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(sessionFor('ADMINISTRADOR', -1), PROFILE_PERMISSIONS_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(sessionFor('GESTOR', -1), VEHICLES_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(sessionFor('SOLICITANTE', -1), SOLICITANTE_ALIAS_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(sessionFor('GESTOR', -1), AUDIT_LOGS_ALIAS_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute({ ...sessionFor(), perfil: 'MOTORISTA' }, '/viagens/minhas'), { kind: 'redirect', to: '/login' })
})

test('nomes de perfis informados por Lucas são reconhecidos sem ampliar acesso', () => {
  assert.equal(resolveProfile('Solicitante interno'), 'SOLICITANTE')
  assert.equal(resolveProfile('atendente SVO'), 'ATENDENTE_SVO')
  assert.equal(resolveProfile('equipe SVO'), 'EQUIPE_SVO')
  assert.equal(resolveProfile('administrador do sistema'), 'ADMINISTRADOR')
  assert.equal(resolveProfile('motorista'), 'MOTORISTA')
  assert.equal(resolveProfile('Gestor de Frota'), 'GESTOR')
  assert.equal(resolveProfile('desconhecido'), null)
})

test('somente MOTORISTA abre /viagens/minhas; demais perfis voltam à própria home', () => {
  assert.deepEqual(resolveRoute(sessionFor('MOTORISTA'), '/viagens/minhas'), {
    kind: 'home',
    profile: 'MOTORISTA',
  })
  for (const [profile, home] of destinations) {
    if (profile === 'MOTORISTA') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), '/viagens/minhas'), {
      kind: 'redirect',
      to: home,
    })
  }
})

test('somente GESTOR abre a tela de confirmação de viagens', () => {
  assert.deepEqual(resolveRoute(sessionFor('GESTOR'), TRIP_CONFIRMATION_PATH), {
    kind: 'trip-confirmation', profile: 'GESTOR',
  })
  for (const [profile, home] of destinations) {
    if (profile === 'GESTOR') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), TRIP_CONFIRMATION_PATH), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, TRIP_CONFIRMATION_PATH), { kind: 'redirect', to: '/login' })
})
