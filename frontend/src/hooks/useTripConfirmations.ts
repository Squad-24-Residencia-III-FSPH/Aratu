import { useCallback, useEffect, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import { confirmTrip, listTripConfirmations } from '../services/tripsService.ts'
import type { TripConfirmationFilters, TripConfirmationItem } from '../trips/tripConfirmationTypes.ts'

interface TripLoadState {
  requestKey: string
  items: TripConfirmationItem[]
  error: string
}

/** Encapsula carregamento, confirmação e atualização sem expor I/O de API à apresentação. */
export function useTripConfirmations(api: ApiRequest, filters: TripConfirmationFilters, enabled = true) {
  const [loadState, setLoadState] = useState<TripLoadState | null>(null)
  const [partialError, setPartialError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const requestKey = `${JSON.stringify(filters)}:${refreshVersion}`

  useEffect(() => {
    if (!enabled) return
    let current = true
    void listTripConfirmations(api, filters).then((result) => {
      if (current) { setLoadState({ requestKey, items: result, error: '' }); setPartialError('') }
    }).catch((failure: unknown) => {
      if (current) setLoadState({ requestKey, items: [], error: failure instanceof Error ? failure.message : 'Não foi possível carregar as viagens finalizadas.' })
    })
    return () => { current = false }
  }, [api, enabled, filters, requestKey])

  const refresh = useCallback(() => {
    if (!enabled) return
    setPartialError('')
    setRefreshVersion((version) => version + 1)
  }, [enabled])

  const confirm = useCallback(async (tripId: string) => {
    if (!enabled) return false
    setConfirmingId(tripId)
    setPartialError('')
    setSuccess('')
    try {
      await confirmTrip(api, tripId)
      setLoadState((current) => current
        ? { ...current, items: current.items.filter((trip) => trip.id !== tripId), error: '' }
        : current)
      setSuccess(`Viagem #${tripId} confirmada com sucesso.`)
      try {
        const currentItems = await listTripConfirmations(api, filters)
        setLoadState((current) => current ? { ...current, items: currentItems } : current)
      } catch {
        setPartialError('A confirmação foi registrada, mas a lista não pôde ser atualizada. Atualize a listagem para conferir os dados mais recentes.')
      }
      return true
    } catch (failure: unknown) {
      setLoadState((current) => current ? {
        ...current,
        error: failure instanceof Error ? failure.message : 'Não foi possível confirmar a viagem.',
      } : current)
      return false
    } finally {
      setConfirmingId(null)
    }
  }, [api, enabled, filters])

  const currentState = loadState?.requestKey === requestKey ? loadState : null
  return {
    items: loadState?.items ?? [],
    loading: enabled && currentState === null,
    error: currentState?.error ?? '',
    partialError,
    success,
    confirmingId,
    refresh,
    confirm,
  }
}
