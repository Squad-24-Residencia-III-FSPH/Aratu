import type { ApiRequest } from '../../api/client'
import type { RequestListFilters } from '../../requests/requestTypes'
import { decideRequest } from '../../services/requestsService'
import type { RequestDetailView } from '../../services/requestsService'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Rascunho dos filtros controlados na tela de análise de solicitações. */
export interface RequestAnalysisFilterDraft {
  from: string
  to: string
  requester: string
  service: string
}

/** Erros de validação por campo na barra de filtros da análise. */
export interface RequestAnalysisFilterErrors {
  from?: string
  to?: string
}

/** Resultado estruturado do envio da decisão preservando o status HTTP para tratar 409. */
export type RequestDecisionSubmitResult =
  | { ok: true }
  | { ok: false; status: number | null; message: string }

/** Estado vazio padrão do formulário de filtros da fila pendente. */
export const EMPTY_REQUEST_FILTER_DRAFT: RequestAnalysisFilterDraft = {
  from: '',
  to: '',
  requester: '',
  service: '',
}

/** Verifica se um texto representa uma data civil válida no formato `YYYY-MM-DD`. */
export function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * Extrai filtros iniciais da query string (ex.: `?from=2026-11-24&to=2026-11-24` enviados pelo Dashboard).
 * Datas fora do formato `YYYY-MM-DD` são ignoradas para não quebrar a consulta inicial.
 */
export function parseRequestAnalysisSearchParams(search: string): RequestAnalysisFilterDraft {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const rawFrom = params.get('from')?.trim() ?? ''
  const rawTo = params.get('to')?.trim() ?? ''
  const requester = params.get('requester')?.trim() ?? ''
  const service = params.get('service')?.trim() ?? ''
  return {
    from: isValidCalendarDate(rawFrom) ? rawFrom : '',
    to: isValidCalendarDate(rawTo) ? rawTo : '',
    requester,
    service,
  }
}

/** Converte o rascunho de filtros para parâmetros de consulta da URL preservando apenas valores preenchidos. */
export function buildRequestAnalysisSearchParams(draft: RequestAnalysisFilterDraft): URLSearchParams {
  const params = new URLSearchParams()
  if (draft.from.trim()) params.set('from', draft.from.trim())
  if (draft.to.trim()) params.set('to', draft.to.trim())
  if (draft.requester.trim()) params.set('requester', draft.requester.trim())
  if (draft.service.trim()) params.set('service', draft.service.trim())
  return params
}

/** Converte o rascunho validado para filtros enviados ao endpoint `GET /requests` em fila pendente. */
export function toPendingRequestApiFilters(draft: RequestAnalysisFilterDraft): RequestListFilters {
  return {
    status: 'PENDING',
    page: 1,
    pageSize: 20,
    ...(draft.from.trim() ? { from: draft.from.trim() } : {}),
    ...(draft.to.trim() ? { to: draft.to.trim() } : {}),
    ...(draft.requester.trim() ? { requester: draft.requester.trim() } : {}),
    ...(draft.service.trim() ? { service: draft.service.trim() } : {}),
  }
}

/** Valida datas e ordem cronológica dos filtros antes de consultar a API. */
export function validateRequestAnalysisFilters(draft: RequestAnalysisFilterDraft): RequestAnalysisFilterErrors {
  const errors: RequestAnalysisFilterErrors = {}
  const from = draft.from.trim()
  const to = draft.to.trim()

  if (from && !isValidCalendarDate(from)) {
    errors.from = 'Informe uma data inicial válida.'
  }
  if (to && !isValidCalendarDate(to)) {
    errors.to = 'Informe uma data final válida.'
  }
  if (!errors.from && !errors.to && from && to && from > to) {
    errors.to = 'A data final deve ser igual ou posterior à data inicial.'
  }
  return errors
}

/** Valida a justificativa obrigatória da rejeição rejeitando texto vazio ou composto só por espaços. */
export function validateRejectionReason(reason: string): string | undefined {
  if (reason.trim().length === 0) {
    return 'Informe a justificativa da rejeição.'
  }
  return undefined
}

/**
 * Garante que aprovar/rejeitar só fiquem habilitados quando o detalhe vigente da solicitação
 * selecionada foi carregado sem falhas, está `PENDING` e não sofreu conflito `409`.
 */
export function canDecideLoadedRequest(options: {
  selectedId: string | null
  detail: RequestDetailView | null
  detailLoading: boolean
  detailError: string
  conflictedRequestId: string | null
}): boolean {
  const { selectedId, detail, detailLoading, detailError, conflictedRequestId } = options
  if (!selectedId || detailLoading || detailError) return false
  if (!detail || detail.id !== selectedId) return false
  if (detail.status !== 'PENDING') return false
  if (conflictedRequestId === selectedId) return false
  return true
}

/**
 * Resolve o setor histórico do solicitante congelado no snapshot da solicitação,
 * exibindo ausência legível (`"Não informado"`) para solicitações antigas sem setor.
 */
export function resolveRequesterSector(detail: RequestDetailView): string {
  const candidate = detail.requesterSector
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim()
  }
  return 'Não informado'
}

/** Formata a contagem exibida no rodapé da paginação em português (inclusive quando `total === 0`). */
export function formatPaginationRowsLabel({ from, to, count }: { from: number; to: number; count: number }): string {
  if (count === 0) return '0 de 0'
  return `${from}–${to} de ${count}`
}

/** Traduz os rótulos acessíveis dos botões de paginação do Material UI para português. */
export function getPaginationItemAriaLabel(type: 'first' | 'last' | 'next' | 'previous'): string {
  if (type === 'first') return 'Primeira página'
  if (type === 'last') return 'Última página'
  if (type === 'next') return 'Próxima página'
  return 'Página anterior'
}

/**
 * Envia a decisão utilizando `decideRequest` e captura o status HTTP da resposta
 * sem alterar `requestsService.ts`, permitindo distinguir conflito `409` de falhas transitórias.
 */
export async function decideRequestWithStatus(
  api: ApiRequest,
  id: string,
  decision: 'approve' | 'reject' | 'return',
  reason?: string,
  expectedRevision?: number,
): Promise<RequestDecisionSubmitResult> {
  let responseStatus: number | null = null
  const trackedApi: ApiRequest = async (path, options) => {
    const response = await api(path, options)
    responseStatus = response.status
    return response
  }

  try {
    await decideRequest(trackedApi, id, decision, reason, expectedRevision)
    return { ok: true }
  } catch (failure: unknown) {
    return {
      ok: false,
      status: responseStatus,
      message: failure instanceof Error ? failure.message : 'Não foi possível registrar a decisão.',
    }
  }
}
