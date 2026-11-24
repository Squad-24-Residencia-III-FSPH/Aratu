import {
  isVehicleDocumentStatus,
  isVehicleDocumentType,
  parseAlertDaysInput,
} from '../../types/vehicleDocument.ts'
import type {
  VehicleDocument,
  VehicleDocumentFilters,
  VehicleDocumentStatus,
  VehicleDocumentType,
} from '../../types/vehicleDocument.ts'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface DocumentFormValues {
  vehicleId: string
  documentType: VehicleDocumentType | ''
  documentNumber: string
  issuedAt: string
  expiresAt: string
  notes: string
  reportedBy: string
  reason: string
}

export type DocumentFormErrors = Partial<Record<keyof DocumentFormValues, string>>

export const EMPTY_DOCUMENT_FORM: DocumentFormValues = {
  vehicleId: '',
  documentType: '',
  documentNumber: '',
  issuedAt: '',
  expiresAt: '',
  notes: '',
  reportedBy: '',
  reason: '',
}

/** Verifica se a string representa uma data civil ISO válida (`AAAA-MM-DD`). */
export function isValidIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value) || value.startsWith('0000')) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  )
}

/** Preenche os valores iniciais do formulário a partir de um documento existente. */
export function documentToEditValues(document: VehicleDocument): DocumentFormValues {
  return {
    vehicleId: document.vehicleId,
    documentType: document.documentType,
    documentNumber: document.documentNumber ?? '',
    issuedAt: document.issuedAt ?? '',
    expiresAt: document.expiresAt,
    notes: document.notes ?? '',
    reportedBy: '',
    reason: '',
  }
}

/** Preenche veículo e tipo na renovação sem exigir redigitação (WCAG 3.3.7). */
export function documentToRenewalValues(previous: VehicleDocument): DocumentFormValues {
  return {
    vehicleId: previous.vehicleId,
    documentType: previous.documentType,
    documentNumber: '',
    issuedAt: '',
    expiresAt: '',
    notes: '',
    reportedBy: '',
    reason: '',
  }
}

/**
 * Valida o formulário de cadastro, renovação ou correção de documento de veículo.
 *
 * Aplica as mesmas regras do backend (`vehicle-documents.service.ts`), usando a data
 * de referência civil FSPH informada pela API quando disponível.
 */
export function validateDocumentForm(
  values: DocumentFormValues,
  mode: 'create' | 'renew' | 'edit',
  referenceDate?: string,
): DocumentFormErrors {
  const errors: DocumentFormErrors = {}

  if (mode !== 'edit') {
    if (!values.vehicleId.trim()) errors.vehicleId = 'Selecione o veículo.'
    if (!isVehicleDocumentType(values.documentType)) {
      errors.documentType = 'Selecione o tipo de documento.'
    }
  }

  const expiresAt = values.expiresAt.trim()
  if (!expiresAt || !isValidIsoCalendarDate(expiresAt)) {
    errors.expiresAt = 'Informe a data de vencimento válida no formato AAAA-MM-DD.'
  }

  const issuedAt = values.issuedAt.trim()
  if (issuedAt) {
    if (!isValidIsoCalendarDate(issuedAt)) {
      errors.issuedAt = 'Informe a data de emissão válida no formato AAAA-MM-DD.'
    } else {
      if (referenceDate && issuedAt > referenceDate) {
        errors.issuedAt = 'A data de emissão não pode estar no futuro.'
      }
      if (expiresAt && isValidIsoCalendarDate(expiresAt) && expiresAt < issuedAt) {
        errors.expiresAt = 'O vencimento não pode ser anterior à emissão.'
      }
    }
  }

  if (values.documentType === 'OTHER' && !values.notes.trim()) {
    errors.notes = 'Descreva o documento em observações quando o tipo for Outro.'
  }

  if (!values.reportedBy.trim()) {
    errors.reportedBy = 'Informe a origem da informação.'
  }

  if (!values.reason.trim()) {
    errors.reason = 'Informe a justificativa da operação.'
  }

  return errors
}

export interface ParsedDocumentsUrlParams {
  filters: VehicleDocumentFilters
  alertDays?: number
  alertDaysInput: string
  alertDaysError: string
}

/**
 * Interpreta os query params da URL para abrir a tela já filtrada por situação,
 * veículo, tipo e janela do alerta (`days` ou alias `alertDays`).
 */
export function parseDocumentsUrlParams(searchParams: URLSearchParams): ParsedDocumentsUrlParams {
  const rawVehicleId = searchParams.get('vehicleId')?.trim() ?? ''
  const vehicleId = /^[1-9]\d*$/.test(rawVehicleId) ? rawVehicleId : undefined

  const rawType = searchParams.get('documentType')?.trim() ?? ''
  const documentType: VehicleDocumentType | undefined = isVehicleDocumentType(rawType)
    ? rawType
    : undefined

  const rawStatus = searchParams.get('status')?.trim() ?? ''
  const status: VehicleDocumentStatus | undefined = isVehicleDocumentStatus(rawStatus)
    ? rawStatus
    : undefined

  const rawDays = (searchParams.get('days') ?? searchParams.get('alertDays') ?? '').trim()
  let alertDays: number | undefined
  let alertDaysError = ''
  if (rawDays) {
    const parsed = parseAlertDaysInput(rawDays)
    if (parsed.error) {
      alertDaysError = parsed.error
    } else {
      alertDays = parsed.days
    }
  }

  return {
    filters: {
      ...(vehicleId ? { vehicleId } : {}),
      ...(documentType ? { documentType } : {}),
      ...(status ? { status } : {}),
    },
    alertDays,
    alertDaysInput: rawDays,
    alertDaysError,
  }
}

/** Constrói os query params canônicos preservados na URL da página. */
export function buildDocumentsSearchParams(
  filters: VehicleDocumentFilters,
  alertDays?: number,
): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.vehicleId) next.set('vehicleId', filters.vehicleId)
  if (filters.documentType) next.set('documentType', filters.documentType)
  if (filters.status) next.set('status', filters.status)
  if (alertDays !== undefined) next.set('days', String(alertDays))
  return next
}
