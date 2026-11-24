import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ApiRequest } from '../api/client.ts'
import { listVehicles } from '../services/vehiclesService.ts'
import {
  fetchDashboardIndicators,
  fetchDashboardSummary,
  fetchGestorTripAgenda,
  fetchPendingRequestsCountForDate,
} from '../services/dashboardService.ts'
import type {
  DashboardIndicators,
  DashboardPeriodPreset,
  DashboardSummary,
  GestorTripAgendaItem,
} from '../types/dashboard.ts'
import type { Vehicle } from '../vehicles/vehicleTypes.ts'
import {
  computeQuickPeriodRange,
  isActiveAgendaTrip,
  isValidCivilDate,
  todayInMaceio,
  validateAgendaPeriod,
  validateDashboardPeriod,
  type AgendaPeriodValidation,
  type PeriodValidationResult,
} from '../pages/gestor/gestorPage/gestorDashboardData.ts'

const PERIOD_PRESETS: readonly DashboardPeriodPreset[] = ['today', '7days', '30days', '6months', 'custom']

function errorMessageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function isPeriodPreset(value: string | null): value is DashboardPeriodPreset {
  return value !== null && PERIOD_PRESETS.some((preset) => preset === value)
}

interface ResolvedSelection {
  period: DashboardPeriodPreset
  from: string
  to: string
  vehicleId: string
}

function resolveSelectionFromParams(params: URLSearchParams, today: string): ResolvedSelection {
  const rawPeriod = params.get('period')
  const rawFrom = params.get('from')
  const rawTo = params.get('to')
  const vehicleId = params.get('vehicleId') ?? ''

  if (isPeriodPreset(rawPeriod) && rawPeriod !== 'custom') {
    const range = computeQuickPeriodRange(rawPeriod, today)
    return { period: rawPeriod, from: range.from, to: range.to, vehicleId }
  }

  if (rawPeriod === 'custom' || (rawFrom !== null || rawTo !== null)) {
    const fallback = computeQuickPeriodRange('30days', today)
    return {
      period: 'custom',
      from: rawFrom ?? fallback.from,
      to: rawTo ?? fallback.to,
      vehicleId,
    }
  }

  const defaultRange = computeQuickPeriodRange('30days', today)
  return { period: '30days', from: defaultRange.from, to: defaultRange.to, vehicleId }
}

/** Estado completo do Início operacional do Gestor integrado às APIs reais. */
export interface GestorHomeState {
  today: string
  summary: DashboardSummary | null
  todayTrips: GestorTripAgendaItem[]
  todayPendingRequests: number | null
  loading: boolean
  error: string
  partialWarnings: string[]
  tripsError: string
  refresh: () => void
}

interface GestorHomeResult {
  requestKey: string
  summary: DashboardSummary | null
  todayTrips: GestorTripAgendaItem[]
  todayPendingRequests: number | null
  error: string
  tripsError: string
  partialWarnings: string[]
}

/**
 * Carrega o retrato operacional da página inicial do Gestor (`GET /dashboard/summary`)
 * junto às consultas reais de agenda de hoje (`GET /trips`) e pendências do dia (`GET /requests`).
 */
export function useGestorHome(api: ApiRequest, enabled = true): GestorHomeState {
  const today = useMemo(() => todayInMaceio(), [])
  const [result, setResult] = useState<GestorHomeResult | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const requestKey = `${today}:${refreshVersion}`

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let active = true

    void Promise.allSettled([
      fetchDashboardSummary(api, controller.signal),
      fetchGestorTripAgenda(api, { from: today, to: today }, controller.signal),
      fetchPendingRequestsCountForDate(api, today, controller.signal),
    ]).then(([summaryResult, tripsResult, requestsResult]) => {
      if (!active || controller.signal.aborted) return

      if (summaryResult.status === 'rejected') {
        setResult({
          requestKey,
          summary: null,
          todayTrips: [],
          todayPendingRequests: null,
          error: errorMessageFrom(summaryResult.reason, 'Não foi possível carregar o resumo operacional.'),
          tripsError: '',
          partialWarnings: [],
        })
        return
      }

      const warnings: string[] = []
      let todayTrips: GestorTripAgendaItem[] = []
      let tripsError = ''
      if (tripsResult.status === 'fulfilled') {
        todayTrips = tripsResult.value.filter(isActiveAgendaTrip)
      } else {
        tripsError = errorMessageFrom(tripsResult.reason, 'Não foi possível carregar a agenda de hoje.')
        warnings.push('agenda de viagens de hoje')
      }

      let todayPendingRequests: number | null = null
      if (requestsResult.status === 'fulfilled') {
        todayPendingRequests = requestsResult.value
      } else {
        warnings.push('contagem de solicitações para hoje')
      }

      setResult({
        requestKey,
        summary: summaryResult.value,
        todayTrips,
        todayPendingRequests,
        error: '',
        tripsError,
        partialWarnings: warnings,
      })
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [api, enabled, requestKey, today])

  const current = result?.requestKey === requestKey ? result : null
  return {
    today,
    summary: current?.summary ?? null,
    todayTrips: current?.todayTrips ?? [],
    todayPendingRequests: current?.todayPendingRequests ?? null,
    loading: enabled && current === null,
    error: current?.error ?? '',
    partialWarnings: current?.partialWarnings ?? [],
    tripsError: current?.tripsError ?? '',
    refresh,
  }
}

/** Estado completo do Dashboard analítico persistido na URL e integrado ao backend. */
export interface DashboardState {
  today: string
  period: DashboardPeriodPreset
  from: string
  to: string
  vehicleId: string
  validation: PeriodValidationResult
  summary: DashboardSummary | null
  indicators: DashboardIndicators | null
  vehicles: Vehicle[]
  summaryLoading: boolean
  indicatorsLoading: boolean
  vehiclesLoading: boolean
  summaryError: string
  indicatorsError: string
  indicatorsErrorStatus: number | undefined
  vehiclesError: string
  selectPeriod: (preset: DashboardPeriodPreset) => void
  setFrom: (value: string) => void
  setTo: (value: string) => void
  setVehicleId: (value: string) => void
  refresh: () => void
}

interface SummaryLoadState {
  key: string
  data: DashboardSummary | null
  error: string
}

interface VehiclesLoadState {
  key: string
  data: Vehicle[]
  error: string
}

interface IndicatorsLoadState {
  key: string
  data: DashboardIndicators | null
  error: string
  status: number | undefined
}

/**
 * Orquestra os filtros do Dashboard com persistência nos query params da URL
 * e consultas concorrentes seguras a `/dashboard/summary`, `/dashboard/indicators` e `/vehicles`.
 */
export function useDashboard(api: ApiRequest, enabled = true): DashboardState {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = useMemo(() => todayInMaceio(), [])
  const selection = useMemo(() => resolveSelectionFromParams(searchParams, today), [searchParams, today])
  const validation = useMemo(
    () => validateDashboardPeriod(selection.from, selection.to),
    [selection.from, selection.to],
  )

  const [refreshVersion, setRefreshVersion] = useState(0)
  const baseKey = String(refreshVersion)
  const indicatorsKey = validation.valid
    ? `${validation.apiPeriod.from}:${validation.apiPeriod.to}:${selection.vehicleId}:${refreshVersion}`
    : ''

  const [summaryState, setSummaryState] = useState<SummaryLoadState | null>(null)
  const [vehiclesState, setVehiclesState] = useState<VehiclesLoadState | null>(null)
  const [indicatorsState, setIndicatorsState] = useState<IndicatorsLoadState | null>(null)
  const indicatorsGeneration = useRef(0)

  const updateParams = useCallback(
    (next: ResolvedSelection) => {
      const params = new URLSearchParams()
      params.set('period', next.period)
      if (next.period === 'custom') {
        params.set('from', next.from)
        params.set('to', next.to)
      } else {
        if (isValidCivilDate(next.from)) params.set('from', next.from)
        if (isValidCivilDate(next.to)) params.set('to', next.to)
      }
      if (next.vehicleId) params.set('vehicleId', next.vehicleId)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const selectPeriod = useCallback(
    (preset: DashboardPeriodPreset) => {
      if (preset === 'custom') {
        const fallback = computeQuickPeriodRange('30days', today)
        updateParams({
          period: 'custom',
          from: isValidCivilDate(selection.from) ? selection.from : fallback.from,
          to: isValidCivilDate(selection.to) ? selection.to : fallback.to,
          vehicleId: selection.vehicleId,
        })
        return
      }
      const range = computeQuickPeriodRange(preset, today)
      updateParams({
        period: preset,
        from: range.from,
        to: range.to,
        vehicleId: selection.vehicleId,
      })
    },
    [selection.from, selection.to, selection.vehicleId, today, updateParams],
  )

  const setFrom = useCallback(
    (value: string) => {
      updateParams({
        period: 'custom',
        from: value,
        to: selection.to,
        vehicleId: selection.vehicleId,
      })
    },
    [selection.to, selection.vehicleId, updateParams],
  )

  const setTo = useCallback(
    (value: string) => {
      updateParams({
        period: 'custom',
        from: selection.from,
        to: value,
        vehicleId: selection.vehicleId,
      })
    },
    [selection.from, selection.vehicleId, updateParams],
  )

  const setVehicleId = useCallback(
    (value: string) => {
      updateParams({
        period: selection.period,
        from: selection.from,
        to: selection.to,
        vehicleId: value,
      })
    },
    [selection.from, selection.period, selection.to, updateParams],
  )

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let active = true

    void fetchDashboardSummary(api, controller.signal)
      .then((data) => {
        if (!active || controller.signal.aborted) return
        setSummaryState({ key: baseKey, data, error: '' })
      })
      .catch((failure: unknown) => {
        if (!active || controller.signal.aborted) return
        setSummaryState({
          key: baseKey,
          data: null,
          error: errorMessageFrom(failure, 'Não foi possível carregar o resumo atual da frota.'),
        })
      })

    void listVehicles(api)
      .then((list) => {
        if (!active || controller.signal.aborted) return
        setVehiclesState({ key: baseKey, data: list, error: '' })
      })
      .catch((failure: unknown) => {
        if (!active || controller.signal.aborted) return
        setVehiclesState({
          key: baseKey,
          data: [],
          error: errorMessageFrom(failure, 'Não foi possível carregar a lista de veículos para o filtro.'),
        })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [api, baseKey, enabled])

  useEffect(() => {
    if (!enabled || !validation.valid) return

    const generation = ++indicatorsGeneration.current
    const controller = new AbortController()

    void fetchDashboardIndicators(
      api,
      {
        from: validation.apiPeriod.from,
        to: validation.apiPeriod.to,
        ...(selection.vehicleId ? { vehicleId: selection.vehicleId } : {}),
      },
      controller.signal,
    )
      .then((data) => {
        if (generation !== indicatorsGeneration.current || controller.signal.aborted) return
        setIndicatorsState({ key: indicatorsKey, data, error: '', status: undefined })
      })
      .catch((failure: unknown) => {
        if (generation !== indicatorsGeneration.current || controller.signal.aborted) return
        const status = typeof failure === 'object' && failure !== null && 'status' in failure && typeof failure.status === 'number'
          ? failure.status
          : undefined
        setIndicatorsState({
          key: indicatorsKey,
          data: null,
          error: errorMessageFrom(failure, 'Não foi possível carregar os indicadores do período.'),
          status,
        })
      })

    return () => {
      controller.abort()
    }
  }, [api, enabled, indicatorsKey, selection.vehicleId, validation])

  const currentSummary = summaryState?.key === baseKey ? summaryState : null
  const currentVehicles = vehiclesState?.key === baseKey ? vehiclesState : null
  const currentIndicators = validation.valid && indicatorsState?.key === indicatorsKey ? indicatorsState : null

  return {
    today,
    period: selection.period,
    from: selection.from,
    to: selection.to,
    vehicleId: selection.vehicleId,
    validation,
    summary: currentSummary?.data ?? null,
    indicators: currentIndicators?.data ?? null,
    vehicles: currentVehicles?.data ?? [],
    summaryLoading: enabled && currentSummary === null,
    indicatorsLoading: enabled && validation.valid && currentIndicators === null,
    vehiclesLoading: enabled && currentVehicles === null,
    summaryError: currentSummary?.error ?? '',
    indicatorsError: currentIndicators?.error ?? '',
    indicatorsErrorStatus: currentIndicators?.status,
    vehiclesError: currentVehicles?.error ?? '',
    selectPeriod,
    setFrom,
    setTo,
    setVehicleId,
    refresh,
  }
}

const VALID_AGENDA_STATUS_FILTERS = new Set(['ALL', 'SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CONFIRMED', 'CANCELED'])

/** Estado da tela dedicada de agenda completa (`TripAgendaPage`) persistido na URL. */
export interface TripAgendaState {
  today: string
  from: string
  to: string
  status: string
  validation: AgendaPeriodValidation
  items: GestorTripAgendaItem[]
  loading: boolean
  error: string
  setFrom: (value: string) => void
  setTo: (value: string) => void
  setStatus: (value: string) => void
  resetToToday: () => void
  refresh: () => void
}

/**
 * Gerencia filtros persistidos na URL (`from`, `to`, `status`) e consulta à API `GET /trips`
 * para a agenda operacional do Gestor, excluindo viagens canceladas por padrão.
 */
export function useTripAgenda(api: ApiRequest, enabled = true): TripAgendaState {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = useMemo(() => todayInMaceio(), [])

  const from = searchParams.get('from') ?? today
  const to = searchParams.get('to') ?? today
  const rawStatus = searchParams.get('status') ?? ''
  const status = VALID_AGENDA_STATUS_FILTERS.has(rawStatus) ? rawStatus : ''

  const validation = useMemo(() => validateAgendaPeriod(from, to), [from, to])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const requestKey = `${from}:${to}:${status}:${refreshVersion}`

  const [loadState, setLoadState] = useState<{
    key: string
    items: GestorTripAgendaItem[]
    error: string
  } | null>(null)
  const generationRef = useRef(0)

  const updateParams = useCallback(
    (next: { from: string; to: string; status: string }) => {
      const params = new URLSearchParams()
      params.set('from', next.from)
      params.set('to', next.to)
      if (next.status) params.set('status', next.status)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const setFrom = useCallback(
    (value: string) => updateParams({ from: value, to, status }),
    [status, to, updateParams],
  )

  const setTo = useCallback(
    (value: string) => updateParams({ from, to: value, status }),
    [from, status, updateParams],
  )

  const setStatus = useCallback(
    (value: string) => updateParams({ from, to, status: value }),
    [from, to, updateParams],
  )

  const resetToToday = useCallback(
    () => updateParams({ from: today, to: today, status: '' }),
    [today, updateParams],
  )

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!enabled || !validation.valid) return
    const generation = ++generationRef.current
    const controller = new AbortController()
    const apiStatus = status && status !== 'ALL' ? status : undefined

    void fetchGestorTripAgenda(
      api,
      {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(apiStatus ? { status: apiStatus } : {}),
      },
      controller.signal,
    )
      .then((rows) => {
        if (generation !== generationRef.current || controller.signal.aborted) return
        const visibleRows = status === '' ? rows.filter(isActiveAgendaTrip) : rows
        setLoadState({ key: requestKey, items: visibleRows, error: '' })
      })
      .catch((failure: unknown) => {
        if (generation !== generationRef.current || controller.signal.aborted) return
        setLoadState({
          key: requestKey,
          items: [],
          error: errorMessageFrom(failure, 'Não foi possível carregar a agenda de viagens.'),
        })
      })

    return () => {
      controller.abort()
    }
  }, [api, enabled, from, requestKey, status, to, validation.valid])

  const current = validation.valid && loadState?.key === requestKey ? loadState : null
  return {
    today,
    from,
    to,
    status,
    validation,
    items: current?.items ?? [],
    loading: enabled && validation.valid && current === null,
    error: current?.error ?? '',
    setFrom,
    setTo,
    setStatus,
    resetToToday,
    refresh,
  }
}
