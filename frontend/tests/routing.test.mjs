import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoute } from '../src/routing/routeDecision.ts'
import { GESTOR_DASHBOARD_PATH, PROFILE_PERMISSIONS_PATH, resolveProfile } from '../src/auth/profiles.ts'
import { REQUEST_ANALYSIS_PATH } from '../src/requests/requestAccess.ts'
import { sessionFor } from './fixtures.mjs'
import { TRIP_CONFIRMATION_PATH } from '../src/trips/tripConfirmationTypes.ts'
import { TRIP_AGENDA_PATH } from '../src/trips/tripAgendaTypes.ts'
import { SVO_OCCURRENCES_PATH } from '../src/svo/svoOccurrenceTypes.ts'
import { SERVICE_TYPES_PATH } from '../src/services/fleetServicesAccess.ts'
import { SVO_TEAMS_PATH } from '../src/svo/svoTeamTypes.ts'
import { SVO_ORDERS_PATH, SVO_TEAM_ORDERS_PATH } from '../src/svo/svoOrderTypes.ts'
import { VEHICLE_DOCUMENTS_PATH } from '../src/vehicleDocuments/vehicleDocumentTypes.ts'
import { FINES_PATH } from '../src/fines/fineTypes.ts'

const destinations = [
  ['ADMINISTRADOR', '/administracao/usuarios'],
  ['GESTOR', '/solicitacoes/analisar'],
  ['SOLICITANTE', '/solicitacoes/minhas'],
  ['MOTORISTA', '/viagens/minhas'],
  ['ATENDENTE_SVO', '/svo/solicitacoes'],
  ['EQUIPE_SVO', '/svo/ordens'],
]

const vehicleReaders = new Set(['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'])
const VEHICLES_PATH = '/veiculos'
const DRIVERS_PATH = '/motoristas'
const FUELINGS_PATH = '/abastecimentos'

test('acompanhamento SVO admite consulta pelo atendente, gestor e administrador', () => {
  for (const [profile, home] of destinations) {
    assert.deepEqual(resolveRoute(sessionFor(profile), '/svo/acompanhamento'), profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'svo-orders', profile } : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, '/svo/acompanhamento'), { kind: 'redirect', to: '/login' })
})

test('ordens SVO aplicam escopo de equipe e escopo de supervisão', () => {
  for (const [profile, home] of destinations) {
    const mayReadTeamOrders = ['EQUIPE_SVO', 'ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'].includes(profile)
    assert.deepEqual(resolveRoute(sessionFor(profile), SVO_TEAM_ORDERS_PATH), mayReadTeamOrders
      ? { kind: 'svo-team-orders', profile }
      : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SVO_TEAM_ORDERS_PATH), { kind: 'redirect', to: '/login' })
  for (const [profile, home] of destinations) {
    const mayReadAllOrders = ['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'].includes(profile)
    assert.deepEqual(resolveRoute(sessionFor(profile), SVO_ORDERS_PATH), mayReadAllOrders
      ? { kind: 'svo-orders', profile }
      : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SVO_ORDERS_PATH), { kind: 'redirect', to: '/login' })
})

for (const [profile, path] of destinations) {
  test(profile + ' vai para a própria tela e não pode abrir as demais', () => {
    const session = sessionFor(profile)
    assert.deepEqual(resolveRoute(session, '/login'), { kind: 'redirect', to: path })
    const homeDecision = profile === 'ADMINISTRADOR' ? { kind: 'users', profile }
      : profile === 'GESTOR' ? { kind: 'request-analysis', profile }
        : profile === 'ATENDENTE_SVO' ? { kind: 'svo-occurrences', profile }
          : profile === 'EQUIPE_SVO' ? { kind: 'svo-team-orders', profile }
            : { kind: 'home', profile }
    assert.deepEqual(resolveRoute(session, path), homeDecision)
    assert.deepEqual(
      resolveRoute(session, PROFILE_PERMISSIONS_PATH),
      profile === 'ADMINISTRADOR'
        ? { kind: 'profile-permissions', profile }
        : { kind: 'redirect', to: path },
    )
    for (const [, otherPath] of destinations) {
      if (otherPath === path) continue
      if (otherPath === REQUEST_ANALYSIS_PATH && profile === 'ADMINISTRADOR') {
        assert.deepEqual(resolveRoute(session, otherPath), { kind: 'request-analysis', profile })
      } else if (otherPath === SVO_OCCURRENCES_PATH && ['GESTOR', 'ADMINISTRADOR'].includes(profile)) {
        assert.deepEqual(resolveRoute(session, otherPath), { kind: 'svo-occurrences', profile })
      } else if (otherPath === SVO_TEAM_ORDERS_PATH && ['ADMINISTRADOR', 'GESTOR', 'ATENDENTE_SVO'].includes(profile)) {
        assert.deepEqual(resolveRoute(session, otherPath), { kind: 'svo-team-orders', profile })
      } else {
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
    assert.deepEqual(resolveRoute(session, REQUEST_ANALYSIS_PATH), profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'request-analysis', profile }
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
      profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR'
        ? { kind: 'svo-occurrences', profile }
        : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SVO_OCCURRENCES_PATH), { kind: 'redirect', to: '/login' })
})

test('gestor mantém equipes e plantões SVO; administrador tem acesso de manutenção', () => {
  for (const [profile, home] of destinations) {
    assert.deepEqual(resolveRoute(sessionFor(profile), SVO_TEAMS_PATH),
      profile === 'GESTOR' || profile === 'ADMINISTRADOR'
        ? { kind: 'svo-teams', profile }
        : { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SVO_TEAMS_PATH), { kind: 'redirect', to: '/login' })
})

test('gestor e administrador acessam documentos e multas; os demais perfis retornam à própria home', () => {
  for (const [profile, home] of destinations) {
    for (const [path, kind] of [[VEHICLE_DOCUMENTS_PATH, 'vehicle-documents'], [FINES_PATH, 'fines']]) {
      assert.deepEqual(resolveRoute(sessionFor(profile), path), profile === 'GESTOR' || profile === 'ADMINISTRADOR'
        ? { kind, profile } : { kind: 'redirect', to: home })
    }
  }
  assert.deepEqual(resolveRoute(null, VEHICLE_DOCUMENTS_PATH), { kind: 'redirect', to: '/login' })
  assert.deepEqual(resolveRoute(null, FINES_PATH), { kind: 'redirect', to: '/login' })
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

test('caminhos legados do solicitante redirecionam pela home autorizada do perfil atual', () => {
  for (const [profile, home] of destinations) {
    for (const alias of ['/inicio', '/minhas-solicitacoes']) {
      assert.deepEqual(resolveRoute(sessionFor(profile), alias), { kind: 'redirect', to: home })
    }
  }
  assert.deepEqual(resolveRoute(null, '/minhas-solicitacoes'), { kind: 'redirect', to: '/login' })
})

test('GESTOR opera e ADMINISTRADOR consulta a tela de confirmação de viagens', () => {
  assert.deepEqual(resolveRoute(sessionFor('GESTOR'), TRIP_CONFIRMATION_PATH), {
    kind: 'trip-confirmation', profile: 'GESTOR',
  })
  assert.deepEqual(resolveRoute(sessionFor('ADMINISTRADOR'), TRIP_CONFIRMATION_PATH), {
    kind: 'trip-confirmation', profile: 'ADMINISTRADOR',
  })
  for (const [profile, home] of destinations) {
    if (profile === 'GESTOR' || profile === 'ADMINISTRADOR') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), TRIP_CONFIRMATION_PATH), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, TRIP_CONFIRMATION_PATH), { kind: 'redirect', to: '/login' })
})

test('GESTOR e ADMINISTRADOR podem consultar a agenda operacional de todos os estados', () => {
  assert.deepEqual(resolveRoute(sessionFor('GESTOR'), TRIP_AGENDA_PATH), {
    kind: 'trip-agenda', profile: 'GESTOR',
  })
  assert.deepEqual(resolveRoute(sessionFor('ADMINISTRADOR'), TRIP_AGENDA_PATH), {
    kind: 'trip-agenda', profile: 'ADMINISTRADOR',
  })
  for (const [profile, home] of destinations) {
    if (profile === 'GESTOR' || profile === 'ADMINISTRADOR') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), TRIP_AGENDA_PATH), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, TRIP_AGENDA_PATH), { kind: 'redirect', to: '/login' })
})

test('catálogo de tipos de serviço fica disponível para perfis com leitura de serviços', () => {
  for (const profile of ['SOLICITANTE', 'GESTOR', 'ADMINISTRADOR']) {
    assert.deepEqual(resolveRoute(sessionFor(profile), SERVICE_TYPES_PATH), { kind: 'service-types', profile })
  }
  for (const [profile, home] of destinations) {
    if (profile === 'SOLICITANTE' || profile === 'GESTOR' || profile === 'ADMINISTRADOR') continue
    assert.deepEqual(resolveRoute(sessionFor(profile), SERVICE_TYPES_PATH), { kind: 'redirect', to: home })
  }
  assert.deepEqual(resolveRoute(null, SERVICE_TYPES_PATH), { kind: 'redirect', to: '/login' })
})

test('administrador pode consultar o dashboard de supervisão', () => {
  assert.deepEqual(resolveRoute(sessionFor('GESTOR'), GESTOR_DASHBOARD_PATH), { kind: 'dashboard', profile: 'GESTOR' })
  assert.deepEqual(resolveRoute(sessionFor('ADMINISTRADOR'), GESTOR_DASHBOARD_PATH), { kind: 'dashboard', profile: 'ADMINISTRADOR' })
  assert.deepEqual(resolveRoute(sessionFor('SOLICITANTE'), GESTOR_DASHBOARD_PATH), { kind: 'redirect', to: '/solicitacoes/minhas' })
})
