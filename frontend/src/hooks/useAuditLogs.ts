import { useCallback, useEffect, useState } from 'react'
import type { ApiRequest } from '../api/client'
import { AuditLogsRequestError, listAuditLogs } from '../services/auditLogsService'
import {
  AUDIT_LOGS_DEFAULT_PAGE_SIZE,
  AUDIT_LOGS_MAX_PERIOD_DAYS,
} from '../types/auditLog'
import type { AuditLogEntry, AuditLogsQuery } from '../types/auditLog'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ID_PATTERN = /^[1-9]\d{0,18}$/
const MAX_BIGINT_TEXT = '9223372036854775807'
const TABLE_PATTERN = /^[a-z][a-z_]*\.[a-z0-9_-]{1,94}$/
const DAY_MS = 86_400_000

/** Estado editável dos filtros da tela de auditoria. */
export interface AuditLogFilterDraft {
  from: string
  to: string
  userId: string
  operation: string
  table: string
}

/** Erros de validação por campo exibidos antes do envio ou corrigidos na UI. */
export type AuditLogFilterErrors = Partial<Record<keyof AuditLogFilterDraft, string>>

export const EMPTY_AUDIT_FILTER_DRAFT: AuditLogFilterDraft = {
  from: '',
  to: '',
  userId: '',
  operation: '',
  table: '',
}

function isValidIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Valida os filtros segundo o contrato de `GET /audit-logs` antes de consultar a API. */
export function validateAuditFilterDraft(draft: AuditLogFilterDraft): AuditLogFilterErrors {
  const errors: AuditLogFilterErrors = {}
  const from = draft.from.trim()
  const to = draft.to.trim()
  const userId = draft.userId.trim()
  const table = draft.table.trim()

  if (from && !isValidIsoCalendarDate(from)) {
    errors.from = 'Informe a data inicial no formato AAAA-MM-DD.'
  }
  if (to && !isValidIsoCalendarDate(to)) {
    errors.to = 'Informe a data final no formato AAAA-MM-DD.'
  }
  if (from && to && !errors.from && !errors.to) {
    const days = (Date.parse(to) - Date.parse(from)) / DAY_MS
    if (days < 1) {
      errors.to = 'A data final (excluída) deve ser posterior à data inicial.'
    } else if (days > AUDIT_LOGS_MAX_PERIOD_DAYS) {
      errors.to = `O período máximo da consulta é de ${AUDIT_LOGS_MAX_PERIOD_DAYS} dias.`
    }
  }
  if (userId && (!ID_PATTERN.test(userId) || (userId.length === MAX_BIGINT_TEXT.length && userId > MAX_BIGINT_TEXT))) {
    errors.userId = 'Informe um ID numérico positivo válido até 9223372036854775807.'
  }
  if (table && !TABLE_PATTERN.test(table)) {
    errors.table = 'Informe a entidade no formato schema.entidade (ex.: fleet.vehicles).'
  }

  return errors
}

function toQuery(draft: AuditLogFilterDraft, page: number): AuditLogsQuery {
  return {
    ...(draft.from.trim() ? { from: draft.from.trim() } : {}),
    ...(draft.to.trim() ? { to: draft.to.trim() } : {}),
    ...(draft.userId.trim() ? { userId: draft.userId.trim() } : {}),
    ...(draft.operation.trim() ? { operation: draft.operation.trim() } : {}),
    ...(draft.table.trim() ? { table: draft.table.trim() } : {}),
    page,
    pageSize: AUDIT_LOGS_DEFAULT_PAGE_SIZE,
  }
}

interface AuditLoadState {
  requestKey: string
  logs: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  error: string
  forbidden: boolean
}

/**
 * Encapsula filtros, paginação, descarte de respostas tardias e estados da trilha de auditoria.
 */
export function useAuditLogs(api: ApiRequest, allowed: boolean) {
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilterDraft>(EMPTY_AUDIT_FILTER_DRAFT)
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadState, setLoadState] = useState<AuditLoadState | null>(null)
  const requestKey = `${JSON.stringify(appliedFilters)}:${page}:${reloadKey}`

  useEffect(() => {
    if (!allowed) return
    let current = true
    const controller = new AbortController()

    void listAuditLogs(api, toQuery(appliedFilters, page), controller.signal)
      .then((result) => {
        if (!current) return
        setLoadState({
          requestKey,
          logs: result.logs,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
          error: '',
          forbidden: false,
        })
      })
      .catch((cause: unknown) => {
        if (!current || (cause instanceof Error && cause.name === 'AbortError')) return
        const isForbidden = cause instanceof AuditLogsRequestError && cause.statusCode === 403
        setLoadState({
          requestKey,
          logs: [],
          total: 0,
          page,
          pageSize: AUDIT_LOGS_DEFAULT_PAGE_SIZE,
          totalPages: 0,
          error: cause instanceof Error && cause.message
            ? cause.message
            : 'Não foi possível carregar os registros de auditoria.',
          forbidden: isForbidden,
        })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [api, allowed, appliedFilters, page, requestKey])

  const applyFilters = useCallback((nextFilters: AuditLogFilterDraft) => {
    setAppliedFilters(nextFilters)
    setPage(1)
    setReloadKey((current) => current + 1)
  }, [])

  const resetFilters = useCallback(() => {
    setAppliedFilters(EMPTY_AUDIT_FILTER_DRAFT)
    setPage(1)
    setReloadKey((current) => current + 1)
  }, [])

  const goToPage = useCallback((nextPage: number) => {
    if (nextPage < 1) return
    setPage(nextPage)
  }, [])

  const retry = useCallback(() => {
    setReloadKey((current) => current + 1)
  }, [])

  const currentState = allowed && loadState?.requestKey === requestKey ? loadState : null

  return {
    logs: allowed ? (currentState?.logs ?? []) : [],
    total: allowed ? (currentState?.total ?? 0) : 0,
    page: currentState?.page ?? page,
    pageSize: currentState?.pageSize ?? AUDIT_LOGS_DEFAULT_PAGE_SIZE,
    totalPages: allowed ? (currentState?.totalPages ?? 0) : 0,
    loading: allowed && currentState === null,
    error: allowed ? (currentState?.error ?? '') : '',
    forbidden: allowed && Boolean(currentState?.forbidden),
    appliedFilters,
    applyFilters,
    resetFilters,
    goToPage,
    retry,
  }
}
