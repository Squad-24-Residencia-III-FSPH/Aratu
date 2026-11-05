import {
  VEHICLE_CATEGORIES,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_OWNERSHIP_TYPES,
} from './vehicleTypes.ts'
import type {
  Vehicle,
  VehicleAttributes,
  VehicleCategory,
  VehicleOperationType,
  VehicleOwnership,
} from './vehicleTypes.ts'

/** Formatos aceitos pelo backend (antigo e Mercosul). */
const LICENSE_PLATE_PATTERN = /^(?:[A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/
const MIN_VEHICLE_YEAR = 1980
const MAX_VEHICLE_YEAR = 2100

/** Valores editáveis do formulário; números permanecem texto até a validação. */
export interface VehicleFormValues {
  licensePlate: string
  brand: string
  model: string
  year: string
  vehicleType: string
  ownership: VehicleOwnership
  categories: VehicleCategory[]
  seats: string
  bodyLimit: string
  operationType: VehicleOperationType
  reason: string
}

/** Campos que podem exibir mensagem de erro vinculada ao controle. */
export type VehicleFormErrors = Partial<
  Record<'licensePlate' | 'year' | 'seats' | 'bodyLimit' | 'categories' | 'reason', string>
>

export const EMPTY_VEHICLE_FORM: VehicleFormValues = {
  licensePlate: '',
  brand: '',
  model: '',
  year: '',
  vehicleType: '',
  ownership: 'OWNED',
  categories: [],
  seats: '',
  bodyLimit: '',
  operationType: 'ADMINISTRATIVE',
  reason: '',
}

/** Normaliza a placa em digitação, sem validar (a regra real fica no backend). */
export function normalizeLicensePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

/** Converte o veículo persistido em valores de formulário. */
export function vehicleToFormValues(vehicle: Vehicle): VehicleFormValues {
  return {
    licensePlate: vehicle.licensePlate,
    brand: vehicle.brand ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year === null ? '' : String(vehicle.year),
    vehicleType: vehicle.vehicleType ?? '',
    ownership: vehicle.ownership,
    categories: vehicle.categories,
    seats: String(vehicle.seats),
    bodyLimit: String(vehicle.bodyLimit),
    operationType: vehicle.operationType,
    reason: '',
  }
}

/** Valida os campos antes do envio; conforto local, sem substituir o backend. */
export function validateVehicleForm(values: VehicleFormValues): VehicleFormErrors {
  const errors: VehicleFormErrors = {}
  const plate = values.licensePlate.trim()
  if (!plate) {
    errors.licensePlate = 'Informe a placa do veículo.'
  } else if (!LICENSE_PLATE_PATTERN.test(plate)) {
    errors.licensePlate = 'Informe uma placa válida no formato ABC1234 ou ABC1D23.'
  }

  const year = values.year.trim()
  if (year) {
    const parsedYear = Number(year)
    if (!Number.isInteger(parsedYear) || parsedYear < MIN_VEHICLE_YEAR || parsedYear > MAX_VEHICLE_YEAR) {
      errors.year = `Informe um ano entre ${MIN_VEHICLE_YEAR} e ${MAX_VEHICLE_YEAR}.`
    }
  }

  if (!values.seats.trim()) {
    errors.seats = 'Informe a capacidade de passageiros.'
  } else if (!Number.isInteger(Number(values.seats)) || Number(values.seats) < 0) {
    errors.seats = 'A capacidade deve ser um número inteiro não negativo.'
  }

  if (!values.bodyLimit.trim()) {
    errors.bodyLimit = 'Informe o limite de corpos.'
  } else if (!Number.isInteger(Number(values.bodyLimit)) || Number(values.bodyLimit) < 0) {
    errors.bodyLimit = 'O limite de corpos deve ser um número inteiro não negativo.'
  }

  if (values.categories.length === 0) {
    errors.categories = 'Selecione ao menos uma categoria.'
  }

  if (!values.reason.trim()) {
    errors.reason = 'Informe a justificativa da alteração.'
  }

  return errors
}

/** Converte os valores validados no payload de criação/edição da API. */
export function toVehicleAttributes(values: VehicleFormValues): VehicleAttributes {
  const text = (value: string): string | null => {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return {
    licensePlate: values.licensePlate.trim().toUpperCase(),
    brand: text(values.brand),
    model: text(values.model),
    year: values.year.trim() ? Number(values.year) : null,
    vehicleType: text(values.vehicleType),
    ownership: values.ownership,
    categories: [...new Set(values.categories)],
    seats: Number(values.seats),
    bodyLimit: Number(values.bodyLimit),
    weightLimit: null,
    operationType: values.operationType,
  }
}

/** Validações defensivas dos valores de domínio usados nos selects. */
export function isVehicleCategory(value: string): value is VehicleCategory {
  return VEHICLE_CATEGORIES.some((category) => category === value)
}

export function isVehicleOperationType(value: string): value is VehicleOperationType {
  return VEHICLE_OPERATION_TYPES.some((operation) => operation === value)
}

export function isVehicleOwnership(value: string): value is VehicleOwnership {
  return VEHICLE_OWNERSHIP_TYPES.some((ownership) => ownership === value)
}
