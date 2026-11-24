import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/useAuth'
import { resolveProfile } from '../../../auth/profiles'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import { scheduleTrip } from '../../../services/tripsService'
import {
  listApprovedRequests,
  listAvailableDrivers,
  listAvailableVehicles,
} from '../../../services/schedulingService'
import { canScheduleTrips } from '../../../trips/tripSchedulingAccess'
import { TripRequestError } from '../../../trips/tripTypes'
import type { ApprovedRequestSummary, DriverAvailability, VehicleAvailability } from '../../../trips/tripTypes'
import {
  formatVehicleOptionLabel,
  isPastStartScheduleError,
  isSchedulingRequeryStatus,
  reconcileSchedulingSelection,
  summarizeUnavailableDrivers,
  summarizeUnavailableVehicles,
  validatePeriodFields,
} from './schedulingHelpers'
import type {
  PeriodValue,
  ReconciliationTrigger,
  SchedulingSelection,
  UnavailableSummary,
} from './schedulingHelpers'

type AvailabilityState = 'idle' | 'loading' | 'ready' | 'partial' | 'error'
type PeriodFocusField = 'start' | 'end'

interface RequestsFetchState {
  completedKey: number | null
  requests: ApprovedRequestSummary[] | null
  errorKey: number | null
  errorMessage: string
}

interface AvailabilitySnapshot {
  key: string
  vehicles: VehicleAvailability[] | null
  drivers: DriverAvailability[] | null
  errorMessage: string
}

const INITIAL_REQUESTS_STATE: RequestsFetchState = {
  completedKey: null,
  requests: null,
  errorKey: null,
  errorMessage: '',
}

const REQUEST_COLUMNS: readonly DataTableColumn<ApprovedRequestSummary>[] = [
  {
    key: 'request',
    header: 'Solicitação',
    render: (request) => <strong>#{request.id}</strong>,
  },
  { key: 'service', header: 'Tipo de serviço', render: (request) => request.serviceName },
  {
    key: 'period',
    header: 'Data e horário solicitados',
    render: (request) => `${request.requestedDate.split('-').reverse().join('/')} às ${request.requestedTime}`,
  },
  {
    key: 'route',
    header: 'Trajeto',
    render: (request) => `${request.origin} → ${request.destination}`,
  },
  { key: 'purpose', header: 'Finalidade', render: (request) => request.purpose },
]

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function fieldValue(label: string, value: string) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function renderUnavailableDetails(summary: UnavailableSummary, heading: string) {
  if (summary.total === 0) return null
  return (
    <Box
      component="details"
      sx={{
        mt: 0.75,
        fontSize: 13,
        color: 'text.secondary',
        '& summary': {
          cursor: 'pointer',
          minHeight: 32,
          display: 'list-item',
          overflowWrap: 'anywhere',
        },
        '& summary:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.dark',
          outlineOffset: 2,
          borderRadius: 0.5,
        },
      }}
    >
      <summary>{`${heading}: ${summary.overview}`}</summary>
      <Box component="ul" sx={{ mt: 0.75, mb: 0, pl: 2.5 }}>
        {summary.items.map((item) => (
          <Box component="li" key={item.id} sx={{ mb: 0.25, overflowWrap: 'anywhere' }}>
            <strong>{item.label}</strong>
            {` — ${item.reasonText}`}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/** Agenda solicitações aprovadas com veículos e motoristas disponíveis no período escolhido. */
export default function ScheduleTripPage() {
  const { api, session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestIdFromUrl = searchParams.get('requestId')
  const selectedRequestId = requestIdFromUrl ?? ''
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canScheduleTrips(profile)

  const [requestsState, setRequestsState] = useState<RequestsFetchState>(INITIAL_REQUESTS_STATE)
  const [requestRefresh, setRequestRefresh] = useState(0)
  const [period, setPeriod] = useState<PeriodValue>({ start: '', end: '' })
  const [rejectedPastStart, setRejectedPastStart] = useState<string | null>(null)
  const [periodSubmitAttempted, setPeriodSubmitAttempted] = useState(false)
  const [availabilitySnapshot, setAvailabilitySnapshot] = useState<AvailabilitySnapshot | null>(null)
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [requestRefreshSuggested, setRequestRefreshSuggested] = useState(false)
  const [reconciliationNotice, setReconciliationNotice] = useState('')
  const [revalidatingAfterError, setRevalidatingAfterError] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [focusRequest, setFocusRequest] = useState<{ field: PeriodFocusField; seq: number } | null>(null)

  const startInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const endInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const selectionRef = useRef<SchedulingSelection>({ vehicleId: '', driverId: '' })
  const pendingTriggerRef = useRef<ReconciliationTrigger>('refresh')

  useEffect(() => {
    selectionRef.current = { vehicleId, driverId }
  }, [vehicleId, driverId])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Agendar viagem — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    if (!focusRequest) return
    const target = focusRequest.field === 'start' ? startInputRef.current : endInputRef.current
    if (!target) return
    target.focus()
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [focusRequest])

  useEffect(() => {
    if (!allowed) return

    const controller = new AbortController()
    let current = true
    void listApprovedRequests(api, controller.signal)
      .then((loaded) => {
        if (!current) return
        setRequestsState({
          completedKey: requestRefresh,
          requests: loaded,
          errorKey: null,
          errorMessage: '',
        })
      })
      .catch((error: unknown) => {
        if (!current || isAbortError(error)) return
        setRequestsState((previous) => ({
          completedKey: null,
          requests: previous.requests,
          errorKey: requestRefresh,
          errorMessage: formatError(error),
        }))
      })
    return () => {
      current = false
      controller.abort()
    }
  }, [api, allowed, requestRefresh])

  const requests = requestsState.requests
  const requestsError = requestsState.errorKey === requestRefresh ? requestsState.errorMessage : ''
  const requestsLoading = allowed
    && requestsState.completedKey !== requestRefresh
    && requestsState.errorKey !== requestRefresh

  const selectedRequest = useMemo(
    () => requests?.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  )

  const basePeriodValidation = useMemo(
    () => validatePeriodFields(period, rejectedPastStart),
    [period, rejectedPastStart],
  )

  const startFieldError = basePeriodValidation.startError
    ?? (periodSubmitAttempted && !period.start ? 'Informe o início previsto da viagem.' : undefined)
  const endFieldError = basePeriodValidation.endError
    ?? (periodSubmitAttempted && !period.end ? 'Informe o término previsto da viagem.' : undefined)

  const scheduledStart = basePeriodValidation.scheduledStart
  const scheduledEnd = basePeriodValidation.scheduledEnd
  const validPeriod = basePeriodValidation.isValid

  const availabilityKey = selectedRequest && validPeriod && scheduledStart && scheduledEnd
    ? `${selectedRequest.id}|${selectedRequest.serviceId}|${scheduledStart}|${scheduledEnd}|${availabilityRefresh}`
    : null

  useEffect(() => {
    if (!selectedRequest || !validPeriod || !scheduledStart || !scheduledEnd || !availabilityKey) return

    const controller = new AbortController()
    let current = true
    void Promise.allSettled([
      listAvailableVehicles(
        api,
        scheduledStart,
        scheduledEnd,
        selectedRequest.serviceId,
        controller.signal,
        { requestId: selectedRequest.id, passengers: selectedRequest.passengers },
      ),
      listAvailableDrivers(api, scheduledStart, scheduledEnd, controller.signal),
    ]).then(([vehiclesResult, driversResult]) => {
      if (!current) return
      const vehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : null
      const drivers = driversResult.status === 'fulfilled' ? driversResult.value : null
      const vehicleError = vehiclesResult.status === 'rejected' && !isAbortError(vehiclesResult.reason)
        ? formatError(vehiclesResult.reason)
        : ''
      const driverError = driversResult.status === 'rejected' && !isAbortError(driversResult.reason)
        ? formatError(driversResult.reason)
        : ''

      let errorMessage = ''
      if (!vehicles && !drivers) {
        errorMessage = `Veículos: ${vehicleError} Motoristas: ${driverError}`.trim()
      } else if (!vehicles) {
        errorMessage = `Não foi possível consultar os veículos: ${vehicleError}`
      } else if (!drivers) {
        errorMessage = `Não foi possível consultar os motoristas: ${driverError}`
      }

      if (vehicles && drivers) {
        const trigger = pendingTriggerRef.current
        const reconciled = reconcileSchedulingSelection(selectionRef.current, vehicles, drivers, trigger)
        setVehicleId(reconciled.vehicleId)
        setDriverId(reconciled.driverId)
        if (reconciled.hasRemovals) {
          setReconciliationNotice(reconciled.summaryMessage)
          if (trigger === 'revalidation') setScheduleError('')
        } else if (trigger === 'revalidation') {
          setReconciliationNotice('')
        }
        setRevalidatingAfterError(false)
        pendingTriggerRef.current = 'refresh'
      } else {
        setRevalidatingAfterError(false)
      }

      setAvailabilitySnapshot({
        key: availabilityKey,
        vehicles,
        drivers,
        errorMessage,
      })
    })
    return () => {
      current = false
      controller.abort()
    }
  }, [api, selectedRequest, scheduledStart, scheduledEnd, validPeriod, availabilityKey])

  const activeSnapshot = availabilityKey !== null && availabilitySnapshot?.key === availabilityKey
    ? availabilitySnapshot
    : null

  const availabilityState: AvailabilityState = !availabilityKey
    ? 'idle'
    : !activeSnapshot
      ? 'loading'
      : !activeSnapshot.vehicles && !activeSnapshot.drivers
        ? 'error'
        : !activeSnapshot.vehicles || !activeSnapshot.drivers
          ? 'partial'
          : 'ready'

  const availabilityError = activeSnapshot?.errorMessage ?? ''

  const vehicleAvailability = activeSnapshot?.vehicles ?? null
  const driverAvailability = activeSnapshot?.drivers ?? null
  const availableVehicles = useMemo(
    () => vehicleAvailability?.filter((vehicle) => vehicle.available) ?? [],
    [vehicleAvailability],
  )
  const availableDrivers = useMemo(
    () => driverAvailability?.filter((driver) => driver.available) ?? [],
    [driverAvailability],
  )
  const unavailableVehiclesSummary = useMemo(
    () => (vehicleAvailability ? summarizeUnavailableVehicles(vehicleAvailability) : null),
    [vehicleAvailability],
  )
  const unavailableDriversSummary = useMemo(
    () => (driverAvailability ? summarizeUnavailableDrivers(driverAvailability) : null),
    [driverAvailability],
  )

  const selectedVehicleIsAvailable = availableVehicles.some((vehicle) => vehicle.id === vehicleId)
  const selectedDriverIsAvailable = availableDrivers.some((driver) => driver.id === driverId)
  const canSubmit = Boolean(
    selectedRequest
    && validPeriod
    && scheduledStart
    && scheduledEnd
    && selectedVehicleIsAvailable
    && selectedDriverIsAvailable
    && availabilityState === 'ready'
    && !submitting,
  )

  function requestFieldFocus(field: PeriodFocusField) {
    setFocusRequest((current) => ({ field, seq: (current?.seq ?? 0) + 1 }))
  }

  function chooseRequest(request: ApprovedRequestSummary) {
    setSearchParams({ requestId: request.id })
    if (request.id === selectedRequestId) return
    pendingTriggerRef.current = 'refresh'
    setPeriod({ start: '', end: '' })
    setRejectedPastStart(null)
    setPeriodSubmitAttempted(false)
    setVehicleId('')
    setDriverId('')
    setScheduleError('')
    setRequestRefreshSuggested(false)
    setReconciliationNotice('')
    setRevalidatingAfterError(false)
    setSuccessMessage('')
  }

  function changePeriod(field: keyof PeriodValue, value: string) {
    const updated = { ...period, [field]: value }
    pendingTriggerRef.current = 'refresh'
    setPeriod(updated)
    if (field === 'start') {
      setRejectedPastStart(null)
    }
    setScheduleError('')
    setRequestRefreshSuggested(false)
    setReconciliationNotice('')
    setRevalidatingAfterError(false)
  }

  function retryAvailability() {
    setAvailabilityRefresh((current) => current + 1)
  }

  async function submitSchedule() {
    if (!selectedRequest || !scheduledStart || !scheduledEnd || !vehicleId || !driverId || !canSubmit) return
    setSubmitting(true)
    setScheduleError('')
    setRequestRefreshSuggested(false)
    setReconciliationNotice('')
    setSuccessMessage('')
    try {
      const trip = await scheduleTrip(api, {
        requestId: selectedRequest.id,
        vehicleId,
        driverId,
        scheduledStart,
        scheduledEnd,
      })
      pendingTriggerRef.current = 'refresh'
      setSuccessMessage(`Solicitação #${selectedRequest.id} agendada com sucesso como viagem #${trip.id}.`)
      setSearchParams({})
      setPeriod({ start: '', end: '' })
      setRejectedPastStart(null)
      setPeriodSubmitAttempted(false)
      setVehicleId('')
      setDriverId('')
      setRequestRefresh((current) => current + 1)
    } catch (error) {
      if (error instanceof TripRequestError && isSchedulingRequeryStatus(error.status)) {
        pendingTriggerRef.current = 'revalidation'
        if (isPastStartScheduleError(error)) {
          setRejectedPastStart(scheduledStart)
          setScheduleError('')
          setRevalidatingAfterError(false)
          requestFieldFocus('start')
        } else {
          setScheduleError(error.message)
          setRequestRefreshSuggested(
            error.status === 409 && /solicita/i.test(error.message),
          )
          setRevalidatingAfterError(true)
        }
        setAvailabilityRefresh((current) => current + 1)
      } else {
        setScheduleError(formatError(error))
        setRequestRefreshSuggested(
          error instanceof TripRequestError && error.status === 404 && /solicita/i.test(error.message),
        )
        if (error instanceof TripRequestError && error.status === 400) {
          requestFieldFocus(startFieldError ? 'start' : endFieldError ? 'end' : 'start')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleScheduleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPeriodSubmitAttempted(true)
    const nextStartError = basePeriodValidation.startError
      ?? (!period.start ? 'Informe o início previsto da viagem.' : undefined)
    const nextEndError = basePeriodValidation.endError
      ?? (!period.end ? 'Informe o término previsto da viagem.' : undefined)
    if (nextStartError) {
      requestFieldFocus('start')
      return
    }
    if (nextEndError) {
      requestFieldFocus('end')
      return
    }
    void submitSchedule()
  }

  if (!allowed) {
    return (
      <Box sx={{ minWidth: 0, ...accessibleControls }}>
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Somente o Gestor pode agendar solicitações."
        />
      </Box>
    )
  }

  return (
    <Box sx={{ minWidth: 0, maxWidth: '100%', ...accessibleControls }}>
      <PageHeader
        title="Agendar viagem"
        breadcrumbs={['Início', 'Agendar viagem']}
        description="Escolha uma solicitação aprovada e aloque recursos disponíveis para o período previsto."
        sx={{ mb: { xs: 2, md: 3 } }}
      />

      {successMessage && (
        <Alert severity="success" role="status" aria-live="polite" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {requestsError ? (
        <StateFeedback
          kind="error"
          title="Não foi possível carregar as solicitações aprovadas"
          description={requestsError}
          actionLabel="Tentar novamente"
          onAction={() => setRequestRefresh((current) => current + 1)}
        />
      ) : requestsLoading ? (
        <StateFeedback kind="loading" title="Carregando solicitações aprovadas..." />
      ) : requests?.length === 0 ? (
        <StateFeedback
          kind="empty"
          title="Nenhuma solicitação aguardando agendamento"
          description="As solicitações aparecerão aqui depois que o Gestor as aprovar."
        />
      ) : (
        <>
          {selectedRequestId && !selectedRequest && (
            <Alert severity="warning" role="status" sx={{ mb: 2 }}>
              {`A solicitação #${selectedRequestId} não está mais aguardando agendamento. Selecione outra solicitação aprovada na lista abaixo.`}
            </Alert>
          )}

          <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>Solicitações aprovadas</Typography>
          <DataTable
            caption="Solicitações aprovadas aguardando agendamento"
            columns={REQUEST_COLUMNS}
            rows={requests ?? []}
            rowKey={(request) => request.id}
            minWidth={900}
            renderActions={(request) => (
              <Button
                variant={selectedRequestId === request.id ? 'outlined' : 'contained'}
                startIcon={<EventAvailableIcon aria-hidden="true" />}
                onClick={() => chooseRequest(request)}
                aria-label={`Agendar solicitação número ${request.id}`}
                sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
              >
                {selectedRequestId === request.id ? 'Selecionada' : 'Agendar'}
              </Button>
            )}
            emptyContent={<StateFeedback kind="empty" title="Nenhuma solicitação aguardando agendamento" />}
          />

          {selectedRequest && (
            <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ mt: 3 }}>
              <Paper
                component="section"
                aria-labelledby="request-summary-title"
                variant="outlined"
                sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2, minWidth: 0 }}
              >
                <Typography id="request-summary-title" component="h2" variant="h6" sx={{ mb: 2 }}>
                  Resumo da solicitação #{selectedRequest.id}
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                    gap: { xs: 1.5, sm: 2 },
                  }}
                >
                  {fieldValue('Tipo de serviço', selectedRequest.serviceName)}
                  {fieldValue('Origem', selectedRequest.origin)}
                  {fieldValue('Destino', selectedRequest.destination)}
                  {fieldValue('Finalidade', selectedRequest.purpose)}
                  {fieldValue('Data solicitada', selectedRequest.requestedDate.split('-').reverse().join('/'))}
                  {fieldValue('Horário solicitado', selectedRequest.requestedTime)}
                  {fieldValue(
                    'Passageiros',
                    selectedRequest.passengers === 1 ? '1 passageiro' : `${selectedRequest.passengers} passageiros`,
                  )}
                </Box>
              </Paper>

              <Paper
                component="form"
                noValidate
                onSubmit={handleScheduleSubmit}
                aria-labelledby="schedule-form-title"
                variant="outlined"
                sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2, minWidth: 0 }}
              >
                <Typography id="schedule-form-title" component="h2" variant="h6" sx={{ mb: 0.5 }}>
                  Período e alocação
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Informe o período no horário local de Aracaju. A disponibilidade considera o tipo de serviço, a agenda e a situação atual dos recursos.
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                    gap: { xs: 1.5, sm: 2 },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <FormField
                      label="Início previsto"
                      type="datetime-local"
                      value={period.start}
                      onChange={(value) => changePeriod('start', value)}
                      error={startFieldError}
                      inputRef={startInputRef}
                      required
                    />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <FormField
                      label="Término previsto"
                      type="datetime-local"
                      value={period.end}
                      onChange={(value) => changePeriod('end', value)}
                      error={endFieldError}
                      inputRef={endInputRef}
                      required
                    />
                  </Box>
                </Box>

                {availabilityState === 'loading' && (
                  <StateFeedback
                    kind="loading"
                    title={revalidatingAfterError
                      ? 'Reconsultando disponibilidade após conflito ou impedimento...'
                      : 'Consultando disponibilidade de veículos e motoristas...'}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}
                  />
                )}
                {availabilityState === 'error' && (
                  <StateFeedback
                    kind="error"
                    title="Não foi possível consultar a disponibilidade"
                    description={availabilityError}
                    actionLabel="Consultar novamente"
                    onAction={retryAvailability}
                    sx={{ mt: 2, mb: 0 }}
                  />
                )}
                {availabilityState === 'partial' && (
                  <StateFeedback
                    kind="partial"
                    title="Consulta de disponibilidade incompleta"
                    description={availabilityError}
                    actionLabel="Tentar novamente"
                    onAction={retryAvailability}
                    sx={{ mt: 2, mb: 0 }}
                  />
                )}

                {reconciliationNotice && (
                  <Alert severity="warning" role="alert" sx={{ mt: 2 }}>
                    {reconciliationNotice}
                  </Alert>
                )}

                {validPeriod && availabilityState === 'ready' && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <FormSelect
                        label="Veículo disponível"
                        value={vehicleId}
                        onChange={(value) => {
                          setVehicleId(value)
                          setScheduleError('')
                          setRequestRefreshSuggested(false)
                          if (value && driverId) setReconciliationNotice('')
                        }}
                        options={availableVehicles.map((vehicle) => ({
                          value: vehicle.id,
                          label: formatVehicleOptionLabel(vehicle),
                        }))}
                        emptyLabel="Selecione um veículo"
                        disabled={availableVehicles.length === 0}
                        helperText="Apenas veículos compatíveis com o serviço, com lotação adequada e sem impedimentos no período."
                        sx={{
                          '& .MuiSelect-select': {
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                          },
                        }}
                      />
                      {availableVehicles.length === 0 && (
                        <StateFeedback
                          kind="empty"
                          title="Nenhum veículo compatível disponível"
                          description={unavailableVehiclesSummary?.total
                            ? `${unavailableVehiclesSummary.overview} Ajuste o período ou escolha outra solicitação.`
                            : 'Ajuste o período ou escolha outra solicitação de serviço.'}
                          sx={{ mt: 1.5, mb: 0 }}
                        />
                      )}
                      {unavailableVehiclesSummary && renderUnavailableDetails(
                        unavailableVehiclesSummary,
                        'Veículos indisponíveis no período',
                      )}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      <FormSelect
                        label="Motorista disponível"
                        value={driverId}
                        onChange={(value) => {
                          setDriverId(value)
                          setScheduleError('')
                          setRequestRefreshSuggested(false)
                          if (value && vehicleId) setReconciliationNotice('')
                        }}
                        options={availableDrivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                        emptyLabel="Selecione um motorista"
                        disabled={availableDrivers.length === 0}
                        helperText="Considera afastamentos, validade da CNH e conflitos de agenda."
                        sx={{
                          '& .MuiSelect-select': {
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                          },
                        }}
                      />
                      {availableDrivers.length === 0 && (
                        <StateFeedback
                          kind="empty"
                          title="Nenhum motorista disponível"
                          description={unavailableDriversSummary?.total
                            ? `${unavailableDriversSummary.overview} Ajuste o período e consulte novamente.`
                            : 'Ajuste o período e consulte novamente.'}
                          sx={{ mt: 1.5, mb: 0 }}
                        />
                      )}
                      {unavailableDriversSummary && renderUnavailableDetails(
                        unavailableDriversSummary,
                        'Motoristas indisponíveis no período',
                      )}
                    </Box>
                  </Stack>
                )}

                {scheduleError && !revalidatingAfterError && (
                  <Alert
                    severity="error"
                    role="alert"
                    sx={{ mt: 2 }}
                    action={requestRefreshSuggested
                      ? (
                          <Button
                            color="inherit"
                            size="small"
                            onClick={() => setRequestRefresh((current) => current + 1)}
                            sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
                          >
                            Atualizar solicitações
                          </Button>
                        )
                      : undefined}
                  >
                    {scheduleError}
                  </Alert>
                )}
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<EventAvailableIcon aria-hidden="true" />}
                  disabled={!canSubmit}
                  aria-busy={submitting ? 'true' : undefined}
                  sx={{ minHeight: 44, mt: 2, width: { xs: '100%', sm: 'auto' } }}
                >
                  {submitting ? 'Agendando viagem...' : 'Confirmar agendamento'}
                </Button>
              </Paper>
            </Stack>
          )}
        </>
      )}
    </Box>
  )
}
