import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import {
  confirmSvoOccurrence, createSvoOccurrence, getSvoOccurrence, listSvoOccurrences,
  getSvoOccurrenceTriage, saveSvoOccurrenceTriage,
} from '../services/svoOccurrencesService.ts'
import { SvoOccurrenceRequestError } from '../svo/svoOccurrenceTypes.ts'
import type {
  CreateSvoOccurrenceInput, SvoOccurrenceConfirmationResult, SvoOccurrenceCreationResult,
  SvoOccurrenceDetail, SvoOccurrenceFilters, SvoOccurrenceSummary, SaveSvoOccurrenceTriageInput,
  SvoOccurrenceTriage,
} from '../svo/svoOccurrenceTypes.ts'

interface DetailState {
  id: string
  data: SvoOccurrenceDetail | null
  loading: boolean
  error: string
  triage: SvoOccurrenceTriage | null
  triageLoading: boolean
  triageLoadError: string
  triageError: string
}

const initialFilters: SvoOccurrenceFilters = { status: '', from: '', to: '' }
const message = (error: unknown): string => error instanceof Error
  ? error.message
  : 'Não foi possível concluir a operação. Tente novamente.'
const uncertain = (error: unknown): boolean => error instanceof SvoOccurrenceRequestError
  && ['network', 'server', 'invalidResponse'].includes(error.kind)
const triageFieldsMatch = (triage: SvoOccurrenceTriage, input: SaveSvoOccurrenceTriageInput): boolean =>
  triage.deceasedName === (input.deceasedName?.trim() || null)
  && triage.estimatedAge === (input.estimatedAge?.trim() || null)
  && triage.responsiblePhysician === (input.responsiblePhysician?.trim() || null)
  && triage.crm === (input.crm?.trim() || null)
  && triage.preliminaryCauseOfDeath === (input.preliminaryCauseOfDeath?.trim() || null)
  && JSON.stringify(triage.availableDocuments ?? []) === JSON.stringify(input.availableDocuments ?? [])
  && triage.referral === (input.referral?.trim() || null)
  && triage.triageNotes === (input.triageNotes?.trim() || null)

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
  const [savingTriage, setSavingTriage] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState('')
  const [confirmationBlocked, setConfirmationBlocked] = useState(false)
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
    setDetail({ id, data: null, loading: true, error: '', triage: null, triageLoading: true, triageLoadError: '', triageError: '' })
    try {
      const data = await getSvoOccurrence(api, id)
      if (sequence === detailSequence.current && mounted.current) {
        setDetail((current) => current?.id === id
          ? { ...current, data, loading: false, error: '', triageError: '' }
          : current)
      }
    } catch (error) {
      if (sequence === detailSequence.current && mounted.current) {
        setDetail((current) => current?.id === id
          ? { ...current, data: null, loading: false, error: message(error), triageLoading: false }
          : current)
        if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setPermissionDenied(true)
        return
      }
    }
    try {
      const triage = await getSvoOccurrenceTriage(api, id)
      if (sequence === detailSequence.current && mounted.current) {
        setDetail((current) => current?.id === id
          ? { ...current, triage, triageLoading: false, triageLoadError: '', triageError: '' }
          : current)
      }
    } catch (error) {
      if (sequence === detailSequence.current && mounted.current) {
        setDetail((current) => current?.id === id
          ? { ...current, triageLoading: false, triageLoadError: message(error), triageError: '' }
          : current)
        if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setPermissionDenied(true)
      }
    }
  }, [api])

  const closeDetail = useCallback((): void => {
    detailSequence.current += 1
    setDetail(null)
  }, [])

  const saveTriage = useCallback(async (input: SaveSvoOccurrenceTriageInput): Promise<SvoOccurrenceTriage | null> => {
    const currentDetail = detail
    if (sending.current || !currentDetail?.data || currentDetail.data.status !== 'PENDING') return null
    sending.current = true
    setSavingTriage(true)
    setDetail((current) => current?.id === currentDetail.id ? { ...current, triageError: '' } : current)
    const epoch = lifecycle.current
    const previous = currentDetail.triage
    try {
      const saved = await saveSvoOccurrenceTriage(api, currentDetail.id, input, previous)
      if (!mounted.current || epoch !== lifecycle.current) return null
      setDetail((current) => current?.id === currentDetail.id
        ? { ...current, triage: saved, triageLoading: false, triageError: '' }
        : current)
      setNotice(`Triagem da solicitação #${saved.occurrenceId} salva na versão ${saved.revision}.`)
      return saved
    } catch (error) {
      if (!mounted.current || epoch !== lifecycle.current) return null
      const errorMessage = message(error)
      if (uncertain(error)) {
        try {
          const latest = await getSvoOccurrenceTriage(api, currentDetail.id)
          if (latest && latest.revision === (previous?.revision ?? 0) + 1 && triageFieldsMatch(latest, input)) {
            setDetail((current) => current?.id === currentDetail.id
              ? { ...current, triage: latest, triageLoading: false, triageError: '' }
              : current)
            setNotice(`Triagem da solicitação #${latest.occurrenceId} salva na versão ${latest.revision}.`)
            return latest
          }
          setDetail((current) => current?.id === currentDetail.id
            ? { ...current, triage: latest, triageLoading: false, triageError: 'A resposta do salvamento não foi confirmada. Confira a versão consultada antes de tentar novamente.' }
            : current)
        } catch {
          setDetail((current) => current?.id === currentDetail.id
            ? { ...current, triageError: 'Não foi possível confirmar o salvamento. Consulte a triagem antes de tentar novamente.' }
            : current)
        }
      } else {
        setDetail((current) => current?.id === currentDetail.id ? { ...current, triageError: errorMessage } : current)
      }
      if (error instanceof SvoOccurrenceRequestError && error.kind === 'forbidden') setPermissionDenied(true)
      return null
    } finally {
      if (mounted.current && epoch === lifecycle.current) {
        sending.current = false
        setSavingTriage(false)
      }
    }
  }, [api, detail])

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
    if (sending.current || occurrence.status !== 'PENDING' || !detail?.triage) return null
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
      setNotice(`Solicitação #${result.id} confirmada após conferência dos dados recebidos. Esta ação não conclui a triagem clínica.`)
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
  }, [api, detail?.triage, reload])

  function clearCreateError(): void { setCreateError('') }
  function clearConfirmationError(): void {
    setConfirmationError('')
    setConfirmationBlocked(false)
  }

  return {
    occurrences, filters, loading, listError, listErrorKind, partialWarning, detail,
    creating, createError, savingTriage, confirming, confirmationError, confirmationBlocked,
    permissionDenied, notice, reload, changeFilters, openDetail, closeDetail,
    register, saveTriage, confirm, clearCreateError, clearConfirmationError,
  }
}
