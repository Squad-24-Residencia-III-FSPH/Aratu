import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import { confirmTrip, listConfirmedTrips, listTripConfirmations } from '../services/tripsService.ts'
import type { ConfirmedTripItem } from '../services/tripsService.ts'
import type { TripConfirmationFilters, TripConfirmationItem } from '../trips/tripConfirmationTypes.ts'
import { TripRequestError } from '../trips/tripTypes.ts'

export type TripConfirmationQueueStatus = 'FINISHED' | 'CONFIRMED'
export type TripConfirmationQueueItem = TripConfirmationItem | ConfirmedTripItem

interface TripLoadState {
  requestKey: string
  status: TripConfirmationQueueStatus
  items: TripConfirmationQueueItem[]
  error: string
}

export interface ConfirmTripErrorState {
  tripId: string
  message: string
  isConflict: boolean
}

export type ConfirmTripActionResult =
  | { ok: true; message: string; partialError: string }
  | { ok: false; isConflict: boolean }

const LIST_LOAD_FALLBACK = 'Não foi possível carregar as viagens finalizadas.'
const PARTIAL_AFTER_CONFIRM = 'A confirmação foi registrada, mas a lista não pôde ser atualizada. Atualize a listagem para conferir os dados mais recentes.'
const PARTIAL_AFTER_CONFLICT = 'Não foi possível atualizar a listagem após a alteração da viagem. Atualize a lista para conferir a situação atual.'

function formatListLoadError(failure: unknown): string {
  if (failure instanceof TripRequestError && failure.kind === 'validation') {
    if (/from.*posterior.*to/i.test(failure.message)) {
      return 'A data inicial ("De") não pode ser posterior à data final ("Até").'
    }
    return failure.message
  }
  return failure instanceof Error ? failure.message : LIST_LOAD_FALLBACK
}

/**
 * Encapsula carregamento (`FINISHED` ou `CONFIRMED`), confirmação, invalidação em conflito 409
 * e atualização da fila do Gestor.
 *
 * @param api - Cliente autenticado (`useAuth().api`).
 * @param filters - Filtros de período (`from`, `to`) no fuso operacional.
 * @param enabled - Controla se a consulta está habilitada (perfil `GESTOR` e período válido).
 * @param status - Situação consultada na fila (`FINISHED` para conferência ou `CONFIRMED` para recibo).
 */
export function useTripConfirmations(
  api: ApiRequest,
  filters: TripConfirmationFilters,
  enabled = true,
  status: TripConfirmationQueueStatus = 'FINISHED',
) {
  const [loadState, setLoadState] = useState<TripLoadState | null>(null)
  const [confirmError, setConfirmError] = useState<ConfirmTripErrorState | null>(null)
  const [invalidatedTripIds, setInvalidatedTripIds] = useState<readonly string[]>([])
  const [partialError, setPartialError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const confirmingRef = useRef(false)
  const requestSeqRef = useRef(0)
  const requestKey = `${status}:${JSON.stringify(filters)}:${refreshVersion}`

  useEffect(() => {
    if (!enabled) return
    let current = true
    const seq = ++requestSeqRef.current
    const fetchQueue = status === 'CONFIRMED'
      ? listConfirmedTrips(api, filters)
      : listTripConfirmations(api, filters)
    void fetchQueue.then((result) => {
      if (current && seq === requestSeqRef.current) {
        setLoadState({ requestKey, status, items: result, error: '' })
        setPartialError('')
      }
    }).catch((failure: unknown) => {
      if (current && seq === requestSeqRef.current) {
        setLoadState({ requestKey, status, items: [], error: formatListLoadError(failure) })
      }
    })
    return () => { current = false }
  }, [api, enabled, filters, requestKey, status])

  const refresh = useCallback(() => {
    if (!enabled) return
    setPartialError('')
    setConfirmError((current) => (current?.isConflict ? current : null))
    setRefreshVersion((version) => version + 1)
  }, [enabled])

  const clearConfirmError = useCallback(() => {
    setConfirmError(null)
  }, [])

  const confirm = useCallback(async (tripId: string): Promise<ConfirmTripActionResult> => {
    if (!enabled || status !== 'FINISHED' || confirmingRef.current || invalidatedTripIds.includes(tripId)) {
      return { ok: false, isConflict: invalidatedTripIds.includes(tripId) }
    }
    confirmingRef.current = true
    setConfirmingId(tripId)
    setConfirmError(null)
    setPartialError('')
    setSuccess('')
    try {
      await confirmTrip(api, tripId)
      const seq = ++requestSeqRef.current
      setLoadState((current) => current && current.status === 'FINISHED'
        ? { ...current, items: current.items.filter((trip) => trip.id !== tripId), error: '' }
        : current)
      const successMessage = `Viagem #${tripId} confirmada com sucesso.`
      let partial = ''
      try {
        const currentItems = await listTripConfirmations(api, filters)
        if (seq === requestSeqRef.current) {
          setLoadState((current) => current
            ? { ...current, status: 'FINISHED', items: currentItems, error: '' }
            : { requestKey, status: 'FINISHED', items: currentItems, error: '' })
        }
      } catch {
        partial = PARTIAL_AFTER_CONFIRM
        setPartialError(partial)
      }
      setSuccess(successMessage)
      return { ok: true, message: successMessage, partialError: partial }
    } catch (failure: unknown) {
      const kind = failure instanceof TripRequestError ? failure.kind : null
      const isConflict = kind === 'conflict' || kind === 'notFound'
      const message = failure instanceof Error ? failure.message : 'Não foi possível confirmar a viagem.'
      setConfirmError({ tripId, message, isConflict })
      if (isConflict) {
        setInvalidatedTripIds((current) => current.includes(tripId) ? current : [...current, tripId])
        const seq = ++requestSeqRef.current
        try {
          const currentItems = await listTripConfirmations(api, filters)
          if (seq === requestSeqRef.current) {
            setLoadState((current) => current
              ? { ...current, status: 'FINISHED', items: currentItems, error: '' }
              : { requestKey, status: 'FINISHED', items: currentItems, error: '' })
          }
        } catch {
          setPartialError(PARTIAL_AFTER_CONFLICT)
        }
      }
      return { ok: false, isConflict }
    } finally {
      confirmingRef.current = false
      setConfirmingId(null)
    }
  }, [api, enabled, filters, invalidatedTripIds, requestKey, status])

  const currentState = loadState?.requestKey === requestKey ? loadState : null
  const items = loadState?.status === status ? loadState.items : []
  return {
    items,
    loading: enabled && currentState === null,
    error: enabled ? (currentState?.error ?? '') : '',
    confirmError,
    invalidatedTripIds,
    partialError,
    success,
    confirmingId,
    refresh,
    clearConfirmError,
    confirm,
  }
}
