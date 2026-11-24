import type {
  CompatibleVehiclesView,
  CompatibleVehicleSummary,
  FleetService,
} from '../../../services/fleetServicesService'
import type { Vehicle } from '../../../vehicles/vehicleTypes'

/** Estado independente da consulta de veículos compatíveis de um serviço. */
export type ServiceLinksState =
  | { status: 'loading' }
  | { status: 'loaded'; vehicles: CompatibleVehicleSummary[] }
  | { status: 'error'; message: string }

/** Linha do catálogo de tipos de serviço associada ao estado individual de seus vínculos. */
export interface ServiceRow {
  service: FleetService
  links: ServiceLinksState
}

/** Opção exibida no seletor de veículos compatíveis com elegibilidade e contexto histórico. */
export interface CompatibleVehicleOption {
  id: string
  licensePlate: string
  label: string
  inactive: boolean
  historicallyLinked: boolean
  selectable: boolean
}

export interface ServiceFormErrors {
  name?: string
  vehicleIds?: string
  reason?: string
}

export type ServiceFormFieldKey = keyof ServiceFormErrors

/** Compara dois conjuntos de identificadores independentemente da ordem. */
export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((id) => rightSet.has(id))
}

/** Extrai mensagem legível de erro preservando fallback orientador. */
export function readServiceErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

/**
 * Monta as opções de veículos preservando vínculos históricos da resposta REST
 * e marcando veículos inativos como indisponíveis para nova seleção.
 */
export function buildCompatibleVehicleOptions(
  vehicles: readonly Vehicle[],
  historicalLinkedVehicles: readonly CompatibleVehicleSummary[],
  initialLinkedIds: readonly string[],
): CompatibleVehicleOption[] {
  const initialSet = new Set(initialLinkedIds)
  const merged = new Map<string, {
    id: string
    licensePlate: string
    brand?: string | null
    model?: string | null
    inactive: boolean
  }>()

  for (const vehicle of vehicles) {
    merged.set(vehicle.id, {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model,
      inactive: vehicle.status === 'INACTIVE',
    })
  }

  for (const linked of historicalLinkedVehicles) {
    const existing = merged.get(linked.id)
    if (existing) {
      if (linked.status === 'INACTIVE') existing.inactive = true
      continue
    }
    merged.set(linked.id, {
      id: linked.id,
      licensePlate: linked.licensePlate,
      brand: linked.brand,
      model: linked.model,
      inactive: linked.status === 'INACTIVE',
    })
  }

  return Array.from(merged.values())
    .sort((left, right) => left.licensePlate.localeCompare(right.licensePlate, 'pt-BR'))
    .map((vehicle) => {
      const historicallyLinked = initialSet.has(vehicle.id)
      const description = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo'
      const statusSuffix = vehicle.inactive
        ? historicallyLinked
          ? ' (inativo — vínculo histórico)'
          : ' (inativo — indisponível para vínculo)'
        : ''
      return {
        id: vehicle.id,
        licensePlate: vehicle.licensePlate,
        label: `${vehicle.licensePlate} — ${description}${statusSuffix}`,
        inactive: vehicle.inactive,
        historicallyLinked,
        selectable: !vehicle.inactive,
      }
    })
}

/** Valida os campos do formulário de tipo de serviço e aponta o primeiro inválido. */
export function validateServiceFormInput(input: {
  name: string
  reason: string
  vehicleIds: readonly string[]
  vehicleIdsChanged: boolean
  vehicleOptions: readonly CompatibleVehicleOption[]
}): { errors: ServiceFormErrors; firstInvalid: ServiceFormFieldKey | null } {
  const errors: ServiceFormErrors = {}
  if (!input.name.trim()) {
    errors.name = 'Informe o nome do tipo de serviço.'
  }

  if (input.vehicleIdsChanged) {
    const optionMap = new Map(input.vehicleOptions.map((option) => [option.id, option]))
    const inactiveSelected = input.vehicleIds
      .map((id) => optionMap.get(id))
      .filter((option): option is CompatibleVehicleOption => Boolean(option && option.inactive))
    if (inactiveSelected.length > 0) {
      const plates = inactiveSelected.map((option) => option.licensePlate).join(', ')
      errors.vehicleIds = `Veículo(s) inativo(s) não podem ser vinculados (${plates}). Remova-o(s) antes de salvar.`
    }
  }

  if (!input.reason.trim()) {
    errors.reason = 'Informe a justificativa da alteração.'
  }

  const order: readonly ServiceFormFieldKey[] = ['name', 'vehicleIds', 'reason']
  const firstInvalid = order.find((field) => Boolean(errors[field])) ?? null
  return { errors, firstInvalid }
}

/** Resultado da reconciliação de um cadastro cujo retorno ficou incerto. */
export type CreateReconciliationResult =
  | { kind: 'created-confirmed'; service: FleetService }
  | { kind: 'not-created' }

/** Confirma via consulta se um POST com resultado incerto criou o serviço solicitado. */
export function reconcileCreateOutcome(
  servicesFromServer: readonly FleetService[],
  knownPreCreateIds: ReadonlySet<string>,
  submittedName: string,
): CreateReconciliationResult {
  const normalizedTarget = submittedName.trim().toLocaleLowerCase('pt-BR')
  const match = servicesFromServer.find((service) =>
    !knownPreCreateIds.has(service.id)
    && service.name.trim().toLocaleLowerCase('pt-BR') === normalizedTarget)
  if (match) return { kind: 'created-confirmed', service: match }
  return { kind: 'not-created' }
}

/** Resultado da reconciliação de uma edição de atributos com retorno incerto. */
export type AttributesReconciliationResult =
  | { kind: 'unchanged'; service: FleetService }
  | { kind: 'attributes-confirmed'; service: FleetService }
  | { kind: 'concurrent-change'; service: FleetService }
  | { kind: 'not-found' }

/** Confirma via consulta se um PUT de atributos já avançou a revisão do serviço. */
export function reconcileAttributesOutcome(
  servicesFromServer: readonly FleetService[],
  serviceId: string,
  expectedRevision: number,
  submittedName: string,
  submittedDescription: string,
): AttributesReconciliationResult {
  const current = servicesFromServer.find((service) => service.id === serviceId)
  if (!current) return { kind: 'not-found' }
  if (current.revision === expectedRevision) return { kind: 'unchanged', service: current }
  const sameName = current.name.trim() === submittedName.trim()
  const sameDescription = (current.description ?? '') === submittedDescription.trim()
  if (sameName && sameDescription) {
    return { kind: 'attributes-confirmed', service: current }
  }
  return { kind: 'concurrent-change', service: current }
}

/** Resultado da reconciliação de uma atualização de veículos compatíveis com retorno incerto. */
export type VehiclesReconciliationResult =
  | { kind: 'unchanged'; view: CompatibleVehiclesView }
  | { kind: 'vehicles-confirmed'; view: CompatibleVehiclesView }
  | { kind: 'concurrent-change'; view: CompatibleVehiclesView }

/** Confirma via consulta se o PUT de veículos já foi gravado no mesmo ID. */
export function reconcileVehiclesOutcome(
  view: CompatibleVehiclesView,
  expectedRevision: number,
  submittedVehicleIds: readonly string[],
): VehiclesReconciliationResult {
  if (view.revision === expectedRevision) {
    return { kind: 'unchanged', view }
  }
  const serverIds = view.vehicles.map((vehicle) => vehicle.id)
  if (sameIds(serverIds, submittedVehicleIds)) {
    return { kind: 'vehicles-confirmed', view }
  }
  return { kind: 'concurrent-change', view }
}

/** Resultado da reconciliação de ativação/inativação com retorno incerto. */
export type StatusReconciliationResult =
  | { kind: 'unchanged'; service: FleetService }
  | { kind: 'status-confirmed'; service: FleetService }
  | { kind: 'concurrent-change'; service: FleetService }
  | { kind: 'not-found' }

/** Confirma via consulta se a mudança de situação já foi persistida no servidor. */
export function reconcileStatusOutcome(
  servicesFromServer: readonly FleetService[],
  serviceId: string,
  expectedRevision: number,
  targetActive: boolean,
): StatusReconciliationResult {
  const current = servicesFromServer.find((service) => service.id === serviceId)
  if (!current) return { kind: 'not-found' }
  if (current.revision === expectedRevision) return { kind: 'unchanged', service: current }
  if (current.active === targetActive) return { kind: 'status-confirmed', service: current }
  return { kind: 'concurrent-change', service: current }
}
