import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import {
  confirmSvoOccurrence, createSvoOccurrence, getSvoOccurrence, listSvoOccurrences, retrySvoDispatch,
} from '../services/svoOccurrencesService.ts'
import { SvoOccurrenceRequestError } from '../svo/svoOccurrenceTypes.ts'
import type {
  CreateSvoOccurrenceInput, SvoOccurrenceConfirmationResult, SvoOccurrenceCreationResult,
  SvoOccurrenceDetail, SvoOccurrenceFilters, SvoOccurrenceSummary,
} from '../svo/svoOccurrenceTypes.ts'

interface DetailState {
  id: string
  data: SvoOccurrenceDetail | null
  loading: boolean
  error: string
}

const initialFilters: SvoOccurrenceFilters = { status: '', from: '', to: '' }
const message = (error: unknown): string => error instanceof Error
  ? error.message
  : 'Não foi possível concluir a operação. Tente novamente.'
const uncertain = (error: unknown): boolean => error instanceof SvoOccurrenceRequestError
  && ['network', 'server', 'invalidResponse'].includes(error.kind)

/**
 * Isola consulta, cadastro, detalhe e confirmação da apresentação, limpando respostas antigas.
 */
export function useSvoOccurrences(api: ApiRequest, initialStatus: SvoOccurrenceFilters['status'] = '') {
  const [occurrences, setOccurrences] = useState<SvoOccurrenceSummary[] | null>(null)
  const [filters, setFilters] = useState<SvoOccurrenceFilters>(() => ({ ...initialFilters, status: initialStatus }))
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [listErrorKind, setListErrorKind] = useState<SvoOccurrenceRequestError['kind'] | null>(null)
  const [partialWarning, setPartialWarning] = useState('')
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState('')
  const [confirmationBlocked, setConfirmationBlocked] = useState(false)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  const [dispatchError, setDispatchError] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [notice, setNotice] = useState('')
  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const lifecycle = useRef(0)
  const sending = useRef(false)
  const mounted = useRef(true)

  const reload = useCallback(async (partialMessage?: string): Promise<boolean> => {
    const sequence = ++listSequence.current
    setLoading(true)
    setListError('')
    try {
      const next = await listSvoOccurrences(api, filters)
      if (sequence !== listSequence.current) return false
      setOccurrences(next)
      setListError('')
      setListErrorKind(null)
      setPartialWarning('')
      setPermissionDenied(false)
      return true
    } catch (error) {
      if (sequence !== listSequence.current) return false
      setListError(partialMessage ?? message(error))
      setListErrorKind(error instanceof SvoOccurrenceRequestError ? error.kind : 'network')
      if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setPermissionDenied(true)
      if (partialMessage) setPartialWarning(partialMessage)
      return false
    } finally {
      if (sequence === listSequence.current) setLoading(false)
    }
  }, [api, filters])

  useEffect(() => {
    mounted.current = true
    lifecycle.current += 1
    const currentLifecycle = lifecycle.current
    queueMicrotask(() => {
      if (mounted.current && currentLifecycle === lifecycle.current) void reload()
    })
    return () => {
      mounted.current = false
      lifecycle.current += 1
      listSequence.current += 1
      detailSequence.current += 1
    }
  }, [reload])

  const changeFilters = useCallback((next: SvoOccurrenceFilters): void => {
    if (sending.current) return
    setFilters(next)
    setOccurrences(null)
    setListError('')
    setListErrorKind(null)
    setPartialWarning('')
    setDetail(null)
    detailSequence.current += 1
  }, [])

  const openDetail = useCallback(async (id: string): Promise<void> => {
    const sequence = ++detailSequence.current
    setDetail({ id, data: null, loading: true, error: '' })
    try {
      const data = await getSvoOccurrence(api, id)
      if (sequence === detailSequence.current && mounted.current) {
        setDetail((current) => current?.id === id
          ? { ...current, data, loading: false, error: '' }
          : current)
      }
    } catch (error) {
      if (sequence === detailSequence.current && mounted.current) {
        setDetail((current) => current?.id === id
          ? { ...current, data: null, loading: false, error: message(error) }
          : current)
        if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setPermissionDenied(true)
      }
    }
  }, [api])

  const closeDetail = useCallback((): void => {
    detailSequence.current += 1
    setDetail(null)
  }, [])

  const register = useCallback(async (input: CreateSvoOccurrenceInput): Promise<SvoOccurrenceCreationResult | null> => {
    if (sending.current) return null
    sending.current = true
    setCreating(true)
    setCreateError('')
    setNotice('')
    const epoch = lifecycle.current
    try {
      const created = await createSvoOccurrence(api, input)
      if (!mounted.current || epoch !== lifecycle.current) return null
      const summary: SvoOccurrenceSummary = {
        id: created.id,
        requesterType: input.requesterType,
        location: input.location.trim(),
        status: created.status,
        receivedAt: created.receivedAt,
        createdAt: created.createdAt,
        revision: created.revision,
      }
      setOccurrences((current) => current ? [summary, ...current.filter((item) => item.id !== created.id)] : [summary])
      setNotice(`Solicitação #${created.id} registrada com status ${created.status}.`)
      const refreshed = await reload('A solicitação foi registrada, mas a lista não pôde ser atualizada. Atualize a consulta antes de continuar.')
      if (!refreshed && mounted.current && epoch === lifecycle.current) {
        setPartialWarning('A solicitação foi registrada, mas a lista pode estar desatualizada. Atualize a consulta.')
      }
      return created
    } catch (error) {
      if (!mounted.current || epoch !== lifecycle.current) return null
      setCreateError(message(error))
      if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setPermissionDenied(true)
      if (uncertain(error)) {
        setPartialWarning('O resultado do cadastro é incerto. Consulte a lista antes de tentar registrar novamente.')
        await reload()
      }
      return null
    } finally {
      if (mounted.current && epoch === lifecycle.current) {
        sending.current = false
        setCreating(false)
      }
    }
  }, [api, reload])

  const confirm = useCallback(async (occurrence: SvoOccurrenceDetail): Promise<SvoOccurrenceConfirmationResult | null> => {
    if (sending.current || occurrence.status !== 'PENDING') return null
    sending.current = true
    setConfirming(true)
    setConfirmationError('')
    setConfirmationBlocked(false)
    setNotice('')
    const epoch = lifecycle.current
    try {
      const result = await confirmSvoOccurrence(api, occurrence)
      if (!mounted.current || epoch !== lifecycle.current) return null
      setOccurrences((current) => current?.map((item) => item.id === result.id
        ? { ...item, status: result.status, revision: result.revision }
        : item) ?? null)
      setDetail((current) => current?.id === result.id && current.data
        ? { ...current, data: { ...current.data, status: result.status, triagedAt: result.triagedAt, triagedBy: result.triagedBy, revision: result.revision } }
        : current)
      const dispatchNotice = result.dispatch?.status === 'DISPATCHED'
        ? ` Ordem #${result.dispatch.orderId} encaminhada automaticamente para a equipe e viatura selecionadas.`
        : result.dispatch?.status === 'WAITING'
          ? ` A solicitação aguarda despacho: ${result.dispatch.reason === 'NO_TEAM' ? 'não há equipe elegível no plantão.' : 'não há viatura elegível com vaga.'}`
          : ''
      setNotice(`Solicitação #${result.id} confirmada após conferência dos dados recebidos.${dispatchNotice}`)
      const refreshed = await reload('A confirmação foi concluída, mas a lista não pôde ser atualizada. Atualize a consulta.')
      if (!refreshed && mounted.current && epoch === lifecycle.current) {
        setPartialWarning('A confirmação foi concluída, mas a lista pode estar desatualizada. Atualize a consulta.')
      }
      return result
    } catch (error) {
      if (!mounted.current || epoch !== lifecycle.current) return null
      setConfirmationError(message(error))
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      if (kind === 'forbidden') setPermissionDenied(true)
      if (['network', 'server', 'invalidResponse', 'conflict', 'notFound', 'forbidden', 'session'].includes(kind)) {
        setConfirmationBlocked(true)
      }
      if (uncertain(error) || kind === 'conflict' || kind === 'notFound') await reload()
      return null
    } finally {
      if (mounted.current && epoch === lifecycle.current) {
        sending.current = false
        setConfirming(false)
      }
    }
  }, [api, reload])

  const retryDispatch = useCallback(async (occurrence: SvoOccurrenceSummary): Promise<boolean> => {
    if (sending.current || occurrence.status !== 'CONFIRMED' || !occurrence.dispatchRequestedAt || occurrence.executionOrderId) return false
    sending.current = true
    setDispatchingId(occurrence.id)
    setDispatchError('')
    setNotice('')
    const epoch = lifecycle.current
    try {
      const result = await retrySvoDispatch(api, occurrence)
      if (!mounted.current || epoch !== lifecycle.current) return false
      setNotice(result?.status === 'DISPATCHED'
        ? `Ordem #${result.orderId} criada automaticamente para a solicitação #${occurrence.id}.`
        : `A solicitação #${occurrence.id} continua aguardando recurso elegível.`)
      const refreshed = await reload('A tentativa foi registrada, mas a fila não pôde ser atualizada. Recarregue antes de tentar novamente.')
      if (!refreshed && mounted.current && epoch === lifecycle.current) {
        setPartialWarning('A tentativa foi registrada; consulte a fila antes de repetir a ação.')
      }
      return true
    } catch (error) {
      if (!mounted.current || epoch !== lifecycle.current) return false
      setDispatchError(message(error))
      const kind = error instanceof SvoOccurrenceRequestError ? error.kind : 'network'
      if (kind === 'forbidden') setPermissionDenied(true)
      if (uncertain(error) || kind === 'conflict' || kind === 'notFound') await reload()
      return false
    } finally {
      if (mounted.current && epoch === lifecycle.current) {
        sending.current = false
        setDispatchingId(null)
      }
    }
  }, [api, reload])

  function clearCreateError(): void { setCreateError('') }
  function clearConfirmationError(): void {
    setConfirmationError('')
    setConfirmationBlocked(false)
  }

  return {
    occurrences, filters, loading, listError, listErrorKind, partialWarning, detail,
    creating, createError, confirming, confirmationError, confirmationBlocked,
    dispatchingId, dispatchError,
    permissionDenied, notice, reload, changeFilters, openDetail, closeDetail,
    register, confirm, retryDispatch, clearCreateError, clearConfirmationError,
  }
}
