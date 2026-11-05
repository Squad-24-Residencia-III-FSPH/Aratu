import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeLicensePlate,
  toVehicleAttributes,
  validateVehicleForm,
  vehicleToFormValues,
} from '../src/vehicles/vehicleForm.ts'

const validValues = {
  licensePlate: 'ABC1D23',
  brand: '',
  model: '',
  year: '',
  vehicleType: '',
  ownership: 'OWNED',
  categories: ['PASSENGER'],
  seats: '5',
  bodyLimit: '0',
  operationType: 'ADMINISTRATIVE',
  reason: 'Cadastro fictício',
}

test('aceita placa antiga e Mercosul e exige ao menos uma categoria', () => {
  assert.deepEqual(validateVehicleForm(validValues), {})
  assert.deepEqual(validateVehicleForm({ ...validValues, licensePlate: 'ABC1234' }), {})
  assert.match(
    validateVehicleForm({ ...validValues, licensePlate: 'ABC-123' }).licensePlate,
    /formato ABC1234 ou ABC1D23/,
  )
  assert.equal(validateVehicleForm({ ...validValues, licensePlate: '' }).licensePlate, 'Informe a placa do veículo.')
  assert.match(
    validateVehicleForm({ ...validValues, categories: [] }).categories,
    /ao menos uma categoria/,
  )
})

test('valida ano, capacidade, limite de corpos e justificativa', () => {
  assert.match(validateVehicleForm({ ...validValues, year: '1979' }).year, /entre 1980 e 2100/)
  assert.match(validateVehicleForm({ ...validValues, year: '2024.5' }).year, /entre 1980 e 2100/)
  assert.match(validateVehicleForm({ ...validValues, seats: '-1' }).seats, /inteiro não negativo/)
  assert.match(validateVehicleForm({ ...validValues, bodyLimit: '' }).bodyLimit, /Informe o limite de corpos/)
  assert.equal(validateVehicleForm({ ...validValues, reason: '   ' }).reason, 'Informe a justificativa da alteração.')
})

test('normaliza a placa digitada para maiúsculas e sem separadores', () => {
  assert.equal(normalizeLicensePlate('abc-1d23'), 'ABC1D23')
  assert.equal(normalizeLicensePlate('abc1234xyz'), 'ABC1234')
})

test('converte valores do formulário no payload da API', () => {
  assert.deepEqual(toVehicleAttributes({
    ...validValues,
    brand: '  Marca Fictícia ',
    model: '',
    year: '2024',
    vehicleType: 'Van',
    seats: '5',
    bodyLimit: '2',
    categories: ['PASSENGER', 'PASSENGER', 'BODY'],
  }), {
    licensePlate: 'ABC1D23',
    brand: 'Marca Fictícia',
    model: null,
    year: 2024,
    vehicleType: 'Van',
    ownership: 'OWNED',
    categories: ['PASSENGER', 'BODY'],
    seats: 5,
    bodyLimit: 2,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
  })
})

test('reconstrói o formulário a partir do veículo persistido', () => {
  const values = vehicleToFormValues({
    id: '1',
    licensePlate: 'ABC1D23',
    brand: null,
    model: 'Modelo Fictício',
    year: 2024,
    vehicleType: null,
    ownership: 'LEASED',
    categories: ['BODY'],
    seats: 3,
    bodyLimit: 1,
    weightLimit: null,
    operationType: 'SVO',
    status: 'AVAILABLE',
    revision: 4,
    createdAt: '',
    updatedAt: '',
  })
  assert.deepEqual(values, {
    licensePlate: 'ABC1D23',
    brand: '',
    model: 'Modelo Fictício',
    year: '2024',
    vehicleType: '',
    ownership: 'LEASED',
    categories: ['BODY'],
    seats: '3',
    bodyLimit: '1',
    operationType: 'SVO',
    reason: '',
  })
})
