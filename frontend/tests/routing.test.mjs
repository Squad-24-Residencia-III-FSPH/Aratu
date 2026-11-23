import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoute } from '../src/routing/routeDecision.ts'
import { PROFILE_PERMISSIONS_PATH, resolveProfile } from '../src/auth/profiles.ts'
import { REQUEST_ANALYSIS_PATH } from '../src/requests/requestAccess.ts'
import { sessionFor } from './fixtures.mjs'
import { TRIP_CONFIRMATION_PATH } from '../src/trips/tripConfirmationTypes.ts'
import { SVO_OCCURRENCES_PATH } from '../src/svo/svoOccurrenceTypes.ts'
import { SERVICE_TYPES_PATH } from '../src/services/fleetServicesAccess.ts'

const destinations = [
  ['ADMINISTRADOR', '/administracao/usuarios'],
  ['GESTOR', '/frota/inicio'],
  ['SOLICITANTE', '/solicitacoes/minhas'],
  ['MOTORISTA', '/viagens/minhas'],
  ['ATENDENTE_SVO', '/svo/solicitacoes'],
  ['EQUIPE_SVO', '/svo/ordens'],
]

const vehicleReaders = new Set(['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'])
const VEHICLES_PATH = '/veiculos'
const DRIVERS_PATH = '/motoristas'
const FUELINGS_PATH = '/abastecimentos'

test('acompanhamento SVO é restrito ao atendente e ao gestor, preservando as homes de cada perfil', () => {
  for (const [profile, home] of destinations) {
    assert.deepEqual(resolveRoute(sessionFor(profile), '/svo/acompanhamento'), profile === 'ATENDENTE_SVO' || profile === 'GESTOR'
      ? { kind: 'svo-orders', profile } : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, '/svo/acompanhamento'), { kind: 'redirect', to: '/login' })
})

for (const [profile, path] of destinations) {
  test(profile + ' vai para a própria tela e não pode abrir as demais', () => {
    const session = sessionFor(profile)
    assert.deepEqual(resolveRoute(session, '/login'), { kind: 'redirect', to: path })
    assert.deepEqual(resolveRoute(session, path), profile === 'ATENDENTE_SVO'
      ? { kind: 'svo-occurrences', profile }
      : { kind: 'home', profile })
    assert.deepEqual(
      resolveRoute(session, PROFILE_PERMISSIONS_PATH),
      profile === 'ADMINISTRADOR'
        ? { kind: 'profile-permissions', profile }
        : { kind: 'redirect', to: path },
    )
    for (const [, otherPath] of destinations) {
      if (otherPath !== path && !(otherPath === SVO_OCCURRENCES_PATH && profile === 'ADMINISTRADOR')) {
        assert.deepEqual(resolveRoute(session, otherPath), { kind: 'redirect', to: path })
      }
    }
    assert.deepEqual(
      resolveRoute(session, VEHICLES_PATH),
      vehicleReaders.has(profile)
        ? { kind: 'vehicles', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, DRIVERS_PATH),
      ['GESTOR', 'ADMINISTRADOR'].includes(profile)
        ? { kind: 'drivers', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(
      resolveRoute(session, FUELINGS_PATH),
      ['GESTOR', 'ADMINISTRADOR'].includes(profile)
        ? { kind: 'fuelings', profile }
        : { kind: 'redirect', to: path },
    )
    assert.deepEqual(resolveRoute(session, REQUEST_ANALYSIS_PATH), profile === 'GESTOR'
      ? { kind: 'request-analysis', profile: 'GESTOR' }
      : { kind: 'redirect', to: path })
  })
}

test('sem login e após logout, todas as rotas internas voltam ao login', () => {
  for (const [, path] of [...destinations, ['ADMINISTRADOR', PROFILE_PERMISSIONS_PATH], ['GESTOR', VEHICLES_PATH], ['ADMINISTRADOR', DRIVERS_PATH], ['GESTOR', FUELINGS_PATH]]) {
    assert.deepEqual(resolveRoute(null, path), { kind: 'redirect', to: '/login' })
  }
  assert.deepEqual(resolveRoute(null, '/login'), { kind: 'login' })
})

test('cadastro e consulta de ocorrências SVO são restritos ao atendente e administrador', () => {
  for (const [profile, home] of destinations) {
    assert.deepEqual(resolveRoute(sessionFor(profile), SVO_OCCURRENCES_PATH),
      profile === 'ATENDENTE_SVO' || profile === 'ADMINISTRADOR'
        ? { kind: 'svo-occurrences', profile }
        : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SVO_OCCURRENCES_PATH), { kind: 'redirect', to: '/login' })
})

test('token expirado e sessão adulterada não abrem telas internas', () => {
  assert.deepEqual(resolveRoute(sessionFor('MOTORISTA', -1), '/viagens/minhas'), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(sessionFor('ADMINISTRADOR', -1), PROFILE_PERMISSIONS_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(sessionFor('GESTOR', -1), VEHICLES_PATH), { kind: 'redirect', to: '/login' })
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

test('catálogo independente de tipos de serviço fica disponível para gestor e administrador', () => {
  for (const profile of ['GESTOR', 'ADMINISTRADOR']) {
    assert.deepEqual(resolveRoute(sessionFor(profile), SERVICE_TYPES_PATH), { kind: 'service-types', profile })
  }
  for (const [profile, home] of destinations) {
    if (profile === 'GESTOR' || profile === 'ADMINISTRADOR') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), SERVICE_TYPES_PATH), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SERVICE_TYPES_PATH), { kind: 'redirect', to: '/login' })
})
