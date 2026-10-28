import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoute } from '../src/routing/routeDecision.ts'
import { sessionFor } from './fixtures.mjs'
import {
  getTripRequest,
  getAvailableVehicles,
  getAvailableDrivers,
  getFleetSchedule,
  scheduleTrip,
} from '../src/services/tripScheduleService.ts'

test('Rota pública de avaliação /preview/agendamento permite acesso imediato sem login', () => {
  const decisionNoSession = resolveRoute(null, '/preview/agendamento')
  assert.deepEqual(decisionNoSession, { kind: 'preview-schedule-trip', requestId: '123' })

  const decisionCustom = resolveRoute(null, '/preview/agendamento/456')
  assert.deepEqual(decisionCustom, { kind: 'preview-schedule-trip', requestId: '456' })

  const gestorSession = sessionFor('GESTOR')
  const decisionGestor = resolveRoute(gestorSession, '/preview/agendamento')
  assert.deepEqual(decisionGestor, { kind: 'preview-schedule-trip', requestId: '123' })
})

// 1. Testes de Rota e RBAC para Agendamento de Viagem (FROTA-94)
test('GESTOR tem acesso exclusivo à rota /frota/agendar-viagem/:id e extrai o requestId', () => {
  const gestorSession = sessionFor('GESTOR')
  const decision = resolveRoute(gestorSession, '/frota/agendar-viagem/123')
  assert.deepEqual(decision, { kind: 'schedule-trip', requestId: '123' })

  const decisionCustom = resolveRoute(gestorSession, '/frota/agendar-viagem/999')
  assert.deepEqual(decisionCustom, { kind: 'schedule-trip', requestId: '999' })

  const decisionDefault = resolveRoute(gestorSession, '/frota/agendar-viagem')
  assert.deepEqual(decisionDefault, { kind: 'schedule-trip', requestId: '123' })
})

test('ADMINISTRADOR também tem acesso à rota de agendamento', () => {
  const adminSession = sessionFor('ADMINISTRADOR')
  const decision = resolveRoute(adminSession, '/frota/agendar-viagem/123')
  assert.deepEqual(decision, { kind: 'schedule-trip', requestId: '123' })
})

test('Perfis não autorizados (MOTORISTA, SOLICITANTE, SVO) são barrados e redirecionados para sua home', () => {
  const motoristaSession = sessionFor('MOTORISTA')
  assert.deepEqual(resolveRoute(motoristaSession, '/frota/agendar-viagem/123'), {
    kind: 'redirect',
    to: '/viagens/minhas',
  })

  const solicitanteSession = sessionFor('SOLICITANTE')
  assert.deepEqual(resolveRoute(solicitanteSession, '/frota/agendar-viagem/123'), {
    kind: 'redirect',
    to: '/solicitacoes/minhas',
  })

  const atendenteSession = sessionFor('ATENDENTE_SVO')
  assert.deepEqual(resolveRoute(atendenteSession, '/frota/agendar-viagem/123'), {
    kind: 'redirect',
    to: '/svo/solicitacoes',
  })

  const equipeSession = sessionFor('EQUIPE_SVO')
  assert.deepEqual(resolveRoute(equipeSession, '/frota/agendar-viagem/123'), {
    kind: 'redirect',
    to: '/svo/ordens',
  })
})

test('Usuário sem sessão tentando acessar agendamento é redirecionado para /login', () => {
  assert.deepEqual(resolveRoute(null, '/frota/agendar-viagem/123'), {
    kind: 'redirect',
    to: '/login',
  })
})

// 2. Testes de Regras de Negócio e Serviços (PE-RN-010, PE-RN-023, PE-RN-026, PE-CA-014)
test('getTripRequest carrega resumo da solicitação deferida com campos imutáveis', async () => {
  const req = await getTripRequest('123')
  assert.equal(req.id, '123')
  assert.equal(req.status, 'APPROVED')
  assert.equal(req.requesterName, 'Dr. Marcos Silveira')
  assert.match(req.destination, /Hospital de Urgências de Sergipe/i)
  assert.ok(req.passengersCount > 0)
  assert.ok(req.justification.length > 10)
})

test('getAvailableVehicles e getAvailableDrivers retornam recursos com status de disponibilidade', async () => {
  const vehicles = await getAvailableVehicles()
  assert.ok(vehicles.length >= 3)
  const availableVeh = vehicles.find((v) => v.status === 'AVAILABLE')
  assert.ok(availableVeh)
  assert.ok(availableVeh.isCompatible)

  const drivers = await getAvailableDrivers()
  assert.ok(drivers.length >= 3)
  const availableDrv = drivers.find((d) => d.status === 'AVAILABLE')
  assert.ok(availableDrv)
  assert.ok(availableDrv.isAvailable)
})

test('getFleetSchedule retorna linha do tempo para prevenção de sobreposição de horários (PE-RN-026)', async () => {
  const timeline = await getFleetSchedule()
  assert.ok(Array.isArray(timeline))
  assert.ok(timeline.length > 0)
  for (const item of timeline) {
    assert.ok(item.vehiclePlate)
    assert.ok(item.driverName)
    assert.ok(item.startTime)
    assert.ok(item.endTime)
  }
})

test('scheduleTrip valida datas obrigatórias e cronologia de horários', async () => {
  await assert.rejects(
    scheduleTrip({
      requestId: '123',
      vehicleId: 'veh-01',
      driverId: 'drv-01',
      startDateTime: '',
      endDateTime: '',
    }),
    /Informe as datas e horários/i,
  )

  await assert.rejects(
    scheduleTrip({
      requestId: '123',
      vehicleId: 'veh-01',
      driverId: 'drv-01',
      startDateTime: '2026-10-28T14:00',
      endDateTime: '2026-10-28T10:00', // Término antes do início
    }),
    /O término previsto deve ser posterior/i,
  )
})

test('scheduleTrip detecta conflito de concorrência e preserva dados (PE-CA-014)', async () => {
  // Tentativa de alocar veh-02 no horário disputado (14:00 - 16:00)
  await assert.rejects(
    scheduleTrip({
      requestId: '123',
      vehicleId: 'veh-02',
      driverId: 'drv-01',
      startDateTime: '2026-10-28T14:00',
      endDateTime: '2026-10-28T16:00',
    }),
    (err) => {
      assert.match(err.message, /Conflito de Concorrência/i)
      assert.match(err.message, /preservados/i)
      return true
    },
  )
})

test('scheduleTrip conclui com sucesso e gera protocolo quando dados são válidos', async () => {
  const result = await scheduleTrip({
    requestId: '123',
    vehicleId: 'veh-01',
    driverId: 'drv-01',
    startDateTime: '2026-10-28T08:30',
    endDateTime: '2026-10-28T12:30',
    notes: 'Transporte de exames de rotina',
  })

  assert.equal(result.success, true)
  assert.ok(result.protocol)
  assert.match(result.protocol, /^VG-2026-/)
})
