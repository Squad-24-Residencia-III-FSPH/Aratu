import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
} from '../../../vehicles/vehicleTypes'
import type {
  VehicleCategory,
  VehicleFilters,
  VehicleOperationType,
  VehicleStatus,
} from '../../../vehicles/vehicleTypes'

/** Filtros sincronizados com o endpoint `/vehicles` e com a URL da tela. */
export interface VehicleFilterValues {
  status: VehicleStatus | ''
  category: VehicleCategory | ''
  operationType: VehicleOperationType | ''
}

/** Estado completo dos filtros persistidos na barra de pesquisa da rota. */
export interface VehicleUrlFilterState {
  filters: VehicleFilterValues
  vehicleType: string
}

export const EMPTY_VEHICLE_FILTERS: VehicleFilterValues = {
  status: '',
  category: '',
  operationType: '',
}

function isOneOf<T extends string>(value: string | null, choices: readonly T[]): value is T {
  return value !== null && choices.some((choice) => choice === value)
}

/** Lê os parâmetros permitidos da URL ignorando valores fora do contrato. */
export function parseVehiclesUrlParams(searchParams: URLSearchParams): VehicleUrlFilterState {
  const rawStatus = searchParams.get('status')?.trim() ?? null
  const rawCategory = searchParams.get('category')?.trim() ?? null
  const rawOperationType = searchParams.get('operationType')?.trim() ?? null
  const rawVehicleType = searchParams.get('vehicleType') ?? ''

  return {
    filters: {
      status: isOneOf(rawStatus, VEHICLE_STATUSES) ? rawStatus : '',
      category: isOneOf(rawCategory, VEHICLE_CATEGORIES) ? rawCategory : '',
      operationType: isOneOf(rawOperationType, VEHICLE_OPERATION_TYPES) ? rawOperationType : '',
    },
    vehicleType: rawVehicleType,
  }
}

/** Serializa os filtros ativos para os query params do histórico de navegação. */
export function buildVehiclesSearchParams(
  filters: VehicleFilterValues,
  vehicleType: string,
): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (filters.operationType) params.set('operationType', filters.operationType)
  if (vehicleType.length > 0) {
    params.set('vehicleType', vehicleType)
  }
  return params
}

/** Converte os valores da UI no contrato aceito por `listVehicles`. */
export function toVehicleApiFilters(values: VehicleFilterValues): VehicleFilters {
  return {
    ...(values.status ? { status: values.status } : {}),
    ...(values.category ? { category: values.category } : {}),
    ...(values.operationType ? { operationType: values.operationType } : {}),
  }
}

/** Compara dois recortes de filtros da API. */
export function areVehicleFiltersEqual(left: VehicleFilterValues, right: VehicleFilterValues): boolean {
  return (
    left.status === right.status
    && left.category === right.category
    && left.operationType === right.operationType
  )
}

/** Indica se há algum filtro de API ou de tipo livre ativo. */
export function hasActiveVehicleFilters(values: VehicleFilterValues, vehicleType: string): boolean {
  return Boolean(
    values.status
    || values.category
    || values.operationType
    || vehicleType.trim(),
  )
}

/** Descreve em português o recorte de filtros associado a uma consulta. */
export function describeVehicleFilters(values: VehicleFilterValues, vehicleType = ''): string {
  const parts: string[] = []
  if (values.status) parts.push(`Situação: ${VEHICLE_STATUS_LABELS[values.status]}`)
  if (values.category) parts.push(`Categoria: ${VEHICLE_CATEGORY_LABELS[values.category]}`)
  if (values.operationType) parts.push(`Operação: ${VEHICLE_OPERATION_LABELS[values.operationType]}`)
  if (vehicleType.trim()) parts.push(`Tipo: "${vehicleType.trim()}"`)
  return parts.length > 0 ? parts.join(' · ') : 'Todos os veículos'
}
