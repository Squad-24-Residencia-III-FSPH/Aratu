import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_REQUEST_FORM,
  firstInvalidRequestField,
  formatRequestDateTimePtBr,
  toCreateTripRequestInput,
  validateRequestForm,
} from '../src/requests/requestForm.ts'

// Instante fixo de referência: 2026-12-10 às 14:00 no fuso America/Maceio (UTC-3 = 17:00Z).
const REFERENCE_NOW = new Date('2026-12-10T17:00:00.000Z')

const VALID_VALUES = {
  requestedDate: '2026-12-15',
  requestedTime: '14:30',
  serviceId: '1',
  origin: 'FSPH — Unidade Central',
  destination: 'Hemose — Bloco A',
  purpose: 'Transporte de amostras laboratoriais',
}

test('validateRequestForm aponta todos os campos obrigatórios quando o formulário está vazio', () => {
  const errors = validateRequestForm(EMPTY_REQUEST_FORM, REFERENCE_NOW)
  assert.deepEqual(errors, {
    requestedDate: 'Informe a data da viagem.',
    requestedTime: 'Informe o horário de saída.',
    serviceId: 'Selecione o tipo de serviço.',
    origin: 'Informe o local de origem.',
    destination: 'Informe o destino da viagem.',
    purpose: 'Informe a finalidade da viagem.',
  })
  assert.equal(firstInvalidRequestField(errors), 'requestedDate')
})

test('validateRequestForm rejeita datas malformadas e horários fora de HH:mm', () => {
  const invalidDate = validateRequestForm(
    { ...VALID_VALUES, requestedDate: '2026-02-30', requestedTime: '25:00', serviceId: 'abc' },
    REFERENCE_NOW,
  )
  assert.equal(invalidDate.requestedDate, 'Informe uma data válida no formato AAAA-MM-DD.')
  assert.equal(invalidDate.requestedTime, 'Informe um horário válido no formato HH:mm.')
  assert.equal(invalidDate.serviceId, 'Selecione um tipo de serviço válido.')
})

test('validateRequestForm rejeita data passada ou horário já decorrido no mesmo dia em America/Maceio', () => {
  const pastDay = validateRequestForm(
    { ...VALID_VALUES, requestedDate: '2026-12-09', requestedTime: '16:00' },
    REFERENCE_NOW,
  )
  assert.equal(pastDay.requestedDate, 'A data e o horário da viagem não podem estar no passado.')

  const pastHourSameDay = validateRequestForm(
    { ...VALID_VALUES, requestedDate: '2026-12-10', requestedTime: '13:59' },
    REFERENCE_NOW,
  )
  assert.equal(
    pastHourSameDay.requestedDate,
    'A data e o horário da viagem não podem estar no passado.',
  )
})

test('validateRequestForm aceita horário igual ou posterior ao instante atual em America/Maceio', () => {
  const sameDayFuture = validateRequestForm(
    { ...VALID_VALUES, requestedDate: '2026-12-10', requestedTime: '14:00' },
    REFERENCE_NOW,
  )
  assert.deepEqual(sameDayFuture, {})
  assert.equal(firstInvalidRequestField(sameDayFuture), null)
})

test('toCreateTripRequestInput normaliza espaços excedentes e formatRequestDateTimePtBr formata data', () => {
  const normalized = toCreateTripRequestInput({
    requestedDate: ' 2026-12-15 ',
    requestedTime: ' 14:30 ',
    serviceId: ' 2 ',
    origin: '  FSPH — Unidade Central  ',
    destination: '  Lacen — Recepção  ',
    purpose: '  Coleta de insumos  ',
  })

  assert.deepEqual(normalized, {
    requestedDate: '2026-12-15',
    requestedTime: '14:30',
    serviceId: '2',
    origin: 'FSPH — Unidade Central',
    destination: 'Lacen — Recepção',
    purpose: 'Coleta de insumos',
  })
  assert.equal(formatRequestDateTimePtBr('2026-12-15', '14:30'), '15/12/2026 — 14:30')
})
