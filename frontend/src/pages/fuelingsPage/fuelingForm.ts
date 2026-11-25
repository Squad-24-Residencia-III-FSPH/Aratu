import { FUEL_TYPES } from '../../fuelings/fuelingTypes.ts'
import type { CreateFuelingInput, FuelingVersion, FuelType } from '../../fuelings/fuelingTypes.ts'

const MAX_SQL_INTEGER = 2_147_483_647
const MAX_LITERS_DIGITS = 7
const MAX_LITERS_SCALE = 3
const MAX_VALUE_DIGITS = 10
const MAX_VALUE_SCALE = 2

export interface FuelingFormValues {
  vehicleId: string
  driverId: string
  fueledAt: string
  fuelType: string
  liters: string
  totalValue: string
  odometerKm: string
  station: string
  reason: string
  evidenceDescription: string
}

export type FuelingFormField = keyof FuelingFormValues
export type FuelingFieldErrors = Partial<Record<FuelingFormField, string>>

export const FUELING_FIELD_ORDER: readonly FuelingFormField[] = [
  'vehicleId',
  'driverId',
  'fueledAt',
  'fuelType',
  'liters',
  'totalValue',
  'odometerKm',
  'station',
  'reason',
  'evidenceDescription',
]

export const FUELING_FIELD_LABELS: Readonly<Record<FuelingFormField, string>> = {
  vehicleId: 'Veículo',
  driverId: 'Motorista (opcional)',
  fueledAt: 'Data e hora',
  fuelType: 'Tipo de combustível',
  liters: 'Litros',
  totalValue: 'Valor total (R$)',
  odometerKm: 'Quilometragem (km)',
  station: 'Posto (opcional)',
  reason: 'Justificativa do registro',
  evidenceDescription: 'Descrição da evidência',
}

/** Formata data e hora locais no formato exigido por `datetime-local` (`YYYY-MM-DDTHH:mm`). */
export function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parsePositiveDecimal(
  raw: string,
  label: string,
  maxDigits: number,
  maxScale: number,
  example: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: `Informe ${label}.` }
  }
  const normalized = trimmed.replace(',', '.')
  if (!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    return {
      ok: false,
      error: `Informe ${label} como número positivo com até ${maxScale} casas decimais (ex.: ${example}).`,
    }
  }
  const [whole, fraction = ''] = normalized.split('.')
  if (whole.length > maxDigits || fraction.length > maxScale) {
    return {
      ok: false,
      error: `Informe ${label} com até ${maxDigits} dígitos inteiros e ${maxScale} casas decimais.`,
    }
  }
  if (BigInt(`${whole}${fraction.padEnd(maxScale, '0')}`) <= 0n) {
    return { ok: false, error: `Informe ${label} maior que zero.` }
  }
  return { ok: true, value: `${whole}.${fraction.padEnd(maxScale, '0')}` }
}

function parseOdometerKm(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Informe a quilometragem do veículo no abastecimento.' }
  }
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    return { ok: false, error: 'Informe uma quilometragem inteira maior ou igual a zero.' }
  }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SQL_INTEGER) {
    return { ok: false, error: 'Informe uma quilometragem inteira entre 0 e 2.147.483.647 km.' }
  }
  return { ok: true, value }
}

export type FuelingValidationResult =
  | { ok: true; input: CreateFuelingInput }
  | { ok: false; fieldErrors: FuelingFieldErrors; firstInvalid: FuelingFormField; summary: string }

/**
 * Valida todos os campos do formulário de abastecimento associando mensagens em português
 * aos respectivos rótulos e mantendo o contrato normalizado do backend.
 */
export function validateFuelingForm(
  values: FuelingFormValues,
  reportedBy: string,
  nowMs: number = Date.now(),
): FuelingValidationResult {
  const fieldErrors: FuelingFieldErrors = {}

  if (!values.vehicleId) {
    fieldErrors.vehicleId = 'Selecione o veículo abastecido.'
  }

  let fueledAtIso = ''
  if (!values.fueledAt.trim()) {
    fieldErrors.fueledAt = 'Informe a data e hora do abastecimento.'
  } else {
    const parsed = new Date(values.fueledAt)
    if (!Number.isFinite(parsed.getTime())) {
      fieldErrors.fueledAt = 'Informe uma data e hora válidas para o abastecimento.'
    } else if (parsed.getTime() > nowMs) {
      fieldErrors.fueledAt = 'A data do abastecimento não pode estar no futuro. Confira a data e a hora informadas.'
    } else {
      fueledAtIso = parsed.toISOString()
    }
  }

  if (!values.fuelType || !FUEL_TYPES.includes(values.fuelType as FuelType)) {
    fieldErrors.fuelType = 'Selecione o tipo de combustível.'
  }

  const litersResult = parsePositiveDecimal(
    values.liters,
    'a quantidade de litros',
    MAX_LITERS_DIGITS,
    MAX_LITERS_SCALE,
    '26,375',
  )
  if (!litersResult.ok) fieldErrors.liters = litersResult.error

  const valueResult = parsePositiveDecimal(
    values.totalValue,
    'o valor total em reais',
    MAX_VALUE_DIGITS,
    MAX_VALUE_SCALE,
    '153,40',
  )
  if (!valueResult.ok) fieldErrors.totalValue = valueResult.error

  const odometerResult = parseOdometerKm(values.odometerKm)
  if (!odometerResult.ok) fieldErrors.odometerKm = odometerResult.error

  if (!values.reason.trim()) {
    fieldErrors.reason = 'Informe a justificativa do registro.'
  }

  if (!values.evidenceDescription.trim()) {
    fieldErrors.evidenceDescription = 'Informe a descrição da evidência ou comprovante.'
  }

  const invalidFields = FUELING_FIELD_ORDER.filter((field) => Boolean(fieldErrors[field]))
  if (invalidFields.length > 0 || !litersResult.ok || !valueResult.ok || !odometerResult.ok || !fueledAtIso) {
    const firstInvalid = invalidFields[0] ?? 'vehicleId'
    const summary = invalidFields.length === 1
      ? `Corrija o campo ${FUELING_FIELD_LABELS[firstInvalid]}.`
      : `Corrija os campos destacados (${invalidFields.map((field) => FUELING_FIELD_LABELS[field]).join(', ')}).`
    return { ok: false, fieldErrors, firstInvalid, summary }
  }

  const station = values.station.trim()
  const input: CreateFuelingInput = {
    vehicleId: values.vehicleId,
    driverId: values.driverId || null,
    fueledAt: fueledAtIso,
    fuelType: values.fuelType as FuelType,
    liters: litersResult.value,
    totalValue: valueResult.value,
    odometerKm: odometerResult.value,
    ...(station ? { station } : {}),
    reportedBy: reportedBy.trim() || 'Operador do sistema',
    reason: values.reason.trim(),
    evidenceDescription: values.evidenceDescription.trim(),
  }

  return { ok: true, input }
}

/**
 * Gera assinatura canônica idêntica à normalização do backend (`FuelingsService.normalize`)
 * para preservar `Idempotency-Key` enquanto o conteúdo efetivo não mudar.
 */
export function buildCanonicalFuelingSignature(input: CreateFuelingInput): string {
  return JSON.stringify({
    vehicleId: input.vehicleId,
    driverId: input.driverId ?? null,
    fueledAt: new Date(input.fueledAt).toISOString(),
    fuelType: input.fuelType,
    liters: input.liters,
    totalValue: input.totalValue,
    odometerKm: input.odometerKm,
    station: input.station?.trim() || null,
    reportedBy: input.reportedBy.trim(),
    reason: input.reason.trim(),
    evidenceDescription: input.evidenceDescription?.trim() || null,
  })
}

/** Traduz jargões técnicos da API para rótulos em português e associa ao campo correspondente. */
export function mapBackendFuelingError(rawMessage: string): { field?: FuelingFormField; message: string } {
  const cleanMessage = rawMessage
    .replace(/\bliters\s*\(liters\)/gi, 'Litros')
    .replace(/\((liters|totalValue|odometerKm|fueledAt|fuelType|reason|evidenceDescription|attachmentUrl|reportedBy)\)/gi, '')
    .replace(/\blimite\s+de\s+odometerKm\b/gi, 'Quilometragem (km)')
    .replace(/\bem\s+odometerKm\b/gi, 'em Quilometragem (km)')
    .replace(/\bem\s+fuelType\b/gi, 'em Tipo de combustível')
    .replace(/\bem\s+reason\b/gi, 'em Justificativa do registro')
    .replace(/\bem\s+evidenceDescription\b/gi, 'em Descrição da evidência')
    .replace(/\blisters\b|\bliters\b/gi, 'Litros')
    .replace(/\btotalValue\b/gi, 'Valor total (R$)')
    .replace(/\bodometerKm\b/gi, 'Quilometragem (km)')
    .replace(/\bfueledAt\b/gi, 'Data e hora')
    .replace(/\bfuelType\b/gi, 'Tipo de combustível')
    .replace(/\breason\b/gi, 'Justificativa do registro')
    .replace(/\bevidenceDescription\b/gi, 'Descrição da evidência')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const lower = rawMessage.toLowerCase()
  if (lower.includes('veículo')) return { field: 'vehicleId', message: cleanMessage }
  if (lower.includes('motorista')) return { field: 'driverId', message: cleanMessage }
  if (lower.includes('futuro') || lower.includes('data e hora') || lower.includes('fueledat') || lower.includes('instante')) {
    return { field: 'fueledAt', message: cleanMessage }
  }
  if (lower.includes('combustível') || lower.includes('fueltype')) return { field: 'fuelType', message: cleanMessage }
  if (lower.includes('litros') || lower.includes('liters')) return { field: 'liters', message: cleanMessage }
  if (lower.includes('valor total') || lower.includes('totalvalue')) return { field: 'totalValue', message: cleanMessage }
  if (lower.includes('quilometragem') || lower.includes('odometer')) return { field: 'odometerKm', message: cleanMessage }
  if (lower.includes('posto') || lower.includes('station')) return { field: 'station', message: cleanMessage }
  if (lower.includes('justificativa') || lower.includes('reason')) return { field: 'reason', message: cleanMessage }
  if (lower.includes('evidência') || lower.includes('evidencedescription')) {
    return { field: 'evidenceDescription', message: cleanMessage }
  }
  return { message: cleanMessage }
}

/** Compara um item retornado por `GET /fuelings` com a intenção pendente para reconciliação. */
export function matchesFuelingRecord(candidate: FuelingVersion, input: CreateFuelingInput): boolean {
  if (candidate.vehicleId !== input.vehicleId) return false
  if ((candidate.driverId ?? null) !== (input.driverId ?? null)) return false
  if (candidate.fuelType !== input.fuelType) return false
  if (candidate.odometerKm !== input.odometerKm) return false
  if (Number(candidate.liters) !== Number(input.liters)) return false
  if (Number(candidate.totalValue) !== Number(input.totalValue)) return false
  const candidateTime = Date.parse(candidate.fueledAt)
  const inputTime = Date.parse(input.fueledAt)
  return Number.isFinite(candidateTime) && Number.isFinite(inputTime) && Math.abs(candidateTime - inputTime) < 60_000
}
