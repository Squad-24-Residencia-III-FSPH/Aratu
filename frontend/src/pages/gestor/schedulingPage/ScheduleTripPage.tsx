import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from '@mui/material'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import { useSearchParams } from 'react-router-dom'
import DirectTripPage from './DirectTripPage'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import { useAuth } from '../../../auth/useAuth'
import { listFleetServices } from '../../../services/fleetServicesService'
import type { FleetService } from '../../../services/fleetServicesService'
import { hasPermission } from '../../../auth/access'
import type { ApprovedRequestSummary, DriverAvailability, VehicleAvailability } from '../../../trips/tripTypes'
import { scheduleTrip } from '../../../services/tripsService'
import {
  listApprovedRequests,
  listAvailableDrivers,
  listAvailableVehicles,
} from '../../../services/schedulingService'
import { operationalDateTimeToIso } from '../../../time/operationalTime'

interface PeriodValue {
  start: string
  end: string
}

type AvailabilityState = 'idle' | 'loading' | 'ready' | 'partial' | 'error'

const REQUEST_COLUMNS: readonly DataTableColumn<ApprovedRequestSummary>[] = [
  {
    key: 'request',
    header: 'Solicitação',
    render: (request) => <strong>#{request.id}</strong>,
  },
  { key: 'service', header: 'Tipo de serviço', render: (request) => request.serviceName ?? 'A definir no agendamento' },
  { key: 'status', header: 'Situação', render: (request) => request.status === 'PENDING' ? 'Pendente' : 'Aprovada (legado)' },
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

/** Converte o horário local informado para ISO 8601 no fuso operacional da FSPH. */
function toOperationalIso(value: string): string | null {
  if (!value) return null
  try { return operationalDateTimeToIso(value) } catch { return null }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'
}

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function fieldValue(label: string, value: string) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

/** Agenda solicitações aprovadas com veículos e motoristas disponíveis no período escolhido. */
export default function ScheduleTripPage() {
  const [routeSearchParams] = useSearchParams()
  if (routeSearchParams.get('mode') === 'direct') return <DirectTripPage />
  return <ApprovedRequestSchedulePage />
}

function ApprovedRequestSchedulePage() {
  const { api, session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestIdFromUrl = searchParams.get('requestId')
  const selectedRequestId = requestIdFromUrl ?? ''
  const allowed = hasPermission(session, 'requests:approve-and-schedule')
  const [requests, setRequests] = useState<ApprovedRequestSummary[] | null>(null)
  const [services, setServices] = useState<FleetService[] | null>(null)
  const [servicesError, setServicesError] = useState('')
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError, setRequestsError] = useState('')
  const [requestRefresh, setRequestRefresh] = useState(0)
  const [serviceRefresh, setServiceRefresh] = useState(0)
  const [period, setPeriod] = useState<PeriodValue>({ start: '', end: '' })
  const [vehicleAvailability, setVehicleAvailability] = useState<VehicleAvailability[] | null>(null)
  const [driverAvailability, setDriverAvailability] = useState<DriverAvailability[] | null>(null)
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>('idle')
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [serviceSelection, setServiceSelection] = useState<{ requestId: string; serviceId: string } | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const [submitting, setSubmitting] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [specialRequirementsAcknowledged, setSpecialRequirementsAcknowledged] = useState(false)
  const [evidenceDescription, setEvidenceDescription] = useState('')

  useEffect(() => {
    if (!allowed) return

    let current = true
    void listApprovedRequests(api)
      .then((loaded) => {
        if (!current) return
        setRequests(loaded)
        setRequestsLoading(false)
      })
      .catch((error: unknown) => {
        if (!current) return
        setRequestsError(formatError(error))
        setRequestsLoading(false)
      })
    return () => { current = false }
  }, [api, allowed, requestRefresh])

  useEffect(() => {
    if (!allowed) return
    let current = true
    void listFleetServices(api)
      .then((loaded) => { if (current) setServices(loaded.filter((service) => service.active)) })
      .catch((error: unknown) => {
        if (current) setServicesError(formatError(error))
      })
    return () => { current = false }
  }, [api, allowed, serviceRefresh])

  const selectedRequest = useMemo(
    () => requests?.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  )
  const requestedServiceId = selectedRequest
    ? serviceSelection?.requestId === selectedRequest.id
      ? serviceSelection.serviceId
      : selectedRequest.serviceId ?? ''
    : ''
  const selectedService = services?.find((service) => service.id === requestedServiceId) ?? null
  const serviceId = services && requestedServiceId && !selectedService ? '' : requestedServiceId
  const scheduledStart = toOperationalIso(period.start)
  const scheduledEnd = toOperationalIso(period.end)
  const validPeriod = Boolean(scheduledStart && scheduledEnd && Date.parse(scheduledEnd) > Date.parse(scheduledStart))
  const invalidWallTime = Boolean((period.start && !scheduledStart) || (period.end && !scheduledEnd))

  useEffect(() => {
    if (!selectedRequest || !selectedService || !serviceId || !validPeriod || !scheduledStart || !scheduledEnd) return

    let current = true
    void Promise.allSettled([
      listAvailableVehicles(api, scheduledStart, scheduledEnd, serviceId, selectedRequest.id),
      listAvailableDrivers(api, scheduledStart, scheduledEnd, selectedRequest.id),
    ]).then(([vehiclesResult, driversResult]) => {
      if (!current) return
      const vehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : null
      const drivers = driversResult.status === 'fulfilled' ? driversResult.value : null
      const vehicleError = vehiclesResult.status === 'rejected' ? formatError(vehiclesResult.reason) : ''
      const driverError = driversResult.status === 'rejected' ? formatError(driversResult.reason) : ''
      setVehicleAvailability(vehicles)
      setDriverAvailability(drivers)
      if (!vehicles && !drivers) {
        setAvailabilityState('error')
        setAvailabilityError(`Veículos: ${vehicleError} Motoristas: ${driverError}`)
      } else if (!vehicles || !drivers) {
        setAvailabilityState('partial')
        setAvailabilityError(!vehicles
          ? `Não foi possível consultar os veículos: ${vehicleError}`
          : `Não foi possível consultar os motoristas: ${driverError}`)
      } else {
        setAvailabilityState('ready')
      }
    })
    return () => { current = false }
  }, [api, selectedRequest, selectedService, serviceId, scheduledStart, scheduledEnd, validPeriod, availabilityRefresh])

  const availableVehicles = vehicleAvailability?.filter((vehicle) => vehicle.available) ?? []
  const availableDrivers = driverAvailability?.filter((driver) => driver.available) ?? []
  const selectedVehicleIsAvailable = availableVehicles.some((vehicle) => vehicle.id === vehicleId)
  const selectedDriverIsAvailable = availableDrivers.some((driver) => driver.id === driverId)
  const canSubmit = Boolean(selectedRequest && selectedService && validPeriod && selectedVehicleIsAvailable
    && selectedDriverIsAvailable && availabilityState === 'ready' && !submitting
    && (!selectedRequest.specialRequirements || (specialRequirementsAcknowledged && evidenceDescription.trim())))

  function chooseRequest(request: ApprovedRequestSummary) {
    setSearchParams({ requestId: request.id })
    setPeriod({ start: '', end: '' })
    setServiceSelection({ requestId: request.id, serviceId: request.serviceId ?? '' })
    setVehicleId('')
    setDriverId('')
    setScheduleError('')
    setSuccessMessage('')
    setAvailabilityState('idle')
    setVehicleAvailability(null)
    setDriverAvailability(null)
    setAvailabilityError('')
    setSpecialRequirementsAcknowledged(false)
    setEvidenceDescription('')
    setIdempotencyKey(createIdempotencyKey())
  }

  function changeService(value: string) {
    if (selectedRequest) setServiceSelection({ requestId: selectedRequest.id, serviceId: value })
    setVehicleId('')
    setDriverId('')
    setVehicleAvailability(null)
    setDriverAvailability(null)
    setAvailabilityState('idle')
    setAvailabilityError('')
    setScheduleError('')
    setIdempotencyKey(createIdempotencyKey())
  }

  function changePeriod(field: keyof PeriodValue, value: string) {
    const updated = { ...period, [field]: value }
    const newStart = toOperationalIso(updated.start)
    const newEnd = toOperationalIso(updated.end)
    const isValid = Boolean(newStart && newEnd && Date.parse(newEnd) > Date.parse(newStart))
    setPeriod(updated)
    setAvailabilityState(isValid && selectedRequest && serviceId ? 'loading' : 'idle')
    setVehicleAvailability(null)
    setDriverAvailability(null)
    setAvailabilityError('')
    setVehicleId('')
    setDriverId('')
    setScheduleError('')
    setIdempotencyKey(createIdempotencyKey())
  }

  async function submitSchedule() {
    if (!selectedRequest || !scheduledStart || !scheduledEnd || !vehicleId || !driverId || !canSubmit) return
    setSubmitting(true)
    setScheduleError('')
    setSuccessMessage('')
    try {
      const trip = await scheduleTrip(api, {
        requestId: selectedRequest.id,
        expectedRevision: selectedRequest.revision,
        serviceId,
        vehicleId,
        driverId,
        scheduledStart,
        scheduledEnd,
        ...(selectedRequest.specialRequirements ? {
          specialRequirementsAcknowledged,
          evidenceDescription: evidenceDescription.trim(),
        } : {}),
      }, idempotencyKey)
      setSuccessMessage(`Solicitação #${selectedRequest.id} agendada com sucesso como viagem #${trip.id}.`)
      setSearchParams({})
      setPeriod({ start: '', end: '' })
      setVehicleId('')
      setDriverId('')
      setServiceSelection(null)
      setIdempotencyKey(createIdempotencyKey())
      setSpecialRequirementsAcknowledged(false)
      setEvidenceDescription('')
      setRequestsLoading(true)
      setRequestsError('')
      setAvailabilityState('idle')
      setVehicleAvailability(null)
      setDriverAvailability(null)
      setRequestRefresh((current) => current + 1)
    } catch (error) {
      setScheduleError(formatError(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (!allowed) {
    return <StateFeedback kind="forbidden" title="Acesso restrito" description="Somente o Gestor pode agendar solicitações." />
  }

  return (
    <Box>
      <PageHeader
        title="Agendar viagem"
        description="Classifique o pedido e aloque recursos disponíveis. A aprovação é confirmada junto com a viagem."
        actions={<Button variant="outlined" onClick={() => setSearchParams({ mode: 'direct' })} sx={{ minHeight: 44 }}>
          Criar viagem sem solicitação
        </Button>}
      />

      {successMessage && (
        <Alert severity="success" role="status" aria-live="polite" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {requestsError ? (
        <StateFeedback kind="error" title="Não foi possível carregar as solicitações pendentes"
          description={requestsError} actionLabel="Tentar novamente"
          onAction={() => {
            setRequestsLoading(true)
            setRequestsError('')
            setRequestRefresh((current) => current + 1)
          }} />
      ) : requestsLoading ? (
        <StateFeedback kind="loading" title="Carregando solicitações pendentes..." />
      ) : requests?.length === 0 ? (
        <StateFeedback kind="empty" title="Nenhuma solicitação aguardando agendamento"
          description="As novas solicitações entram aqui para análise e agendamento." />
      ) : (
        <>
          <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>Aguardando agendamento</Typography>
          <DataTable
            caption="Solicitações pendentes e aprovações legadas aguardando agendamento"
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
            <Stack spacing={2.5} sx={{ mt: 3 }}>
              <Paper component="section" aria-labelledby="request-summary-title" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
                <Typography id="request-summary-title" component="h2" variant="h6" sx={{ mb: 2 }}>
                  Resumo da solicitação #{selectedRequest.id}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  {fieldValue('Tipo de serviço', selectedService?.name ?? 'A definir no agendamento')}
                  {fieldValue('Origem', selectedRequest.origin)}
                  {fieldValue('Destino', selectedRequest.destination)}
                  {fieldValue('Finalidade', selectedRequest.purpose)}
                  {fieldValue('Data solicitada', selectedRequest.requestedDate.split('-').reverse().join('/'))}
                  {fieldValue('Horário solicitado', selectedRequest.requestedTime)}
                  {fieldValue('Passageiros', String(selectedRequest.passengers))}
                  {fieldValue('Necessidades especiais', selectedRequest.specialRequirements || 'Não informadas')}
                </Box>
              </Paper>

              <Paper component="section" aria-labelledby="schedule-form-title" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
                <Typography id="schedule-form-title" component="h2" variant="h6" sx={{ mb: 0.5 }}>
                  Período e alocação
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Informe o período no horário local de Aracaju. A disponibilidade considera o tipo de serviço, a agenda e a situação atual dos recursos.
                </Typography>
                {servicesError && <StateFeedback kind="error" title="Não foi possível carregar os tipos de serviço"
                  description={servicesError} actionLabel="Tentar novamente"
                  onAction={() => { setServices(null); setServicesError(''); setServiceRefresh((current) => current + 1) }} sx={{ mb: 2 }} />}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  <FormSelect
                    label="Tipo de serviço"
                    value={serviceId}
                    onChange={changeService}
                    options={(services ?? []).map((service) => ({ value: service.id, label: service.name }))}
                    emptyLabel={services === null ? 'Carregando serviços…' : 'Selecione um tipo de serviço'}
                    disabled={services === null || services.length === 0}
                    helperText={selectedRequest.serviceName && !selectedService
                      ? 'O serviço anterior não está ativo. Escolha um serviço disponível para este agendamento.'
                      : 'Os veículos serão filtrados pelos vínculos ativos deste serviço.'}
                  />
                  <FormField
                    label="Início previsto"
                    type="datetime-local"
                    value={period.start}
                    onChange={(value) => changePeriod('start', value)}
                    required
                  />
                  <FormField
                    label="Término previsto"
                    type="datetime-local"
                    value={period.end}
                    onChange={(value) => changePeriod('end', value)}
                    required
                  />
                </Box>
                {invalidWallTime && (
                  <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
                    Informe um horário válido no fuso operacional de Aracaju.
                  </Alert>
                )}
                {services?.length === 0 && <StateFeedback kind="empty" title="Nenhum tipo de serviço ativo"
                  description="Ative um tipo de serviço e vincule veículos no cadastro antes de agendar." sx={{ mt: 2 }} />}
                {selectedRequest.specialRequirements && (
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Alert severity="info"><strong>Conferência necessária:</strong> {selectedRequest.specialRequirements}</Alert>
                    <FormControlLabel
                      control={<Checkbox checked={specialRequirementsAcknowledged}
                        onChange={event => { setSpecialRequirementsAcknowledged(event.target.checked); setIdempotencyKey(createIdempotencyKey()) }} />}
                      label="Confirmei que o recurso alocado atende às necessidades descritas"
                    />
                    <FormField label="Como as necessidades serão atendidas" value={evidenceDescription}
                      onChange={value => { setEvidenceDescription(value); setIdempotencyKey(createIdempotencyKey()) }} required multiline minRows={2}
                      helperText="Registre a adaptação ou o apoio que foi conferido." />
                  </Stack>
                )}
                {period.start && period.end && scheduledStart && scheduledEnd && !validPeriod && (
                  <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
                    O término previsto precisa ser posterior ao início.
                  </Alert>
                )}

                {availabilityState === 'loading' && (
                  <StateFeedback kind="loading" title="Consultando disponibilidade de veículos e motoristas..." sx={{ mt: 2 }} />
                )}
                {availabilityState === 'error' && (
                  <StateFeedback kind="error" title="Não foi possível consultar a disponibilidade"
                    description={availabilityError} actionLabel="Consultar novamente"
                    onAction={() => {
                      setAvailabilityState('loading')
                      setAvailabilityError('')
                      setVehicleAvailability(null)
                      setDriverAvailability(null)
                      setAvailabilityRefresh((current) => current + 1)
                    }} sx={{ mt: 2 }} />
                )}
                {availabilityState === 'partial' && (
                  <StateFeedback kind="partial" title="Consulta de disponibilidade incompleta"
                    description={availabilityError} actionLabel="Tentar novamente"
                    onAction={() => {
                      setAvailabilityState('loading')
                      setAvailabilityError('')
                      setVehicleAvailability(null)
                      setDriverAvailability(null)
                      setAvailabilityRefresh((current) => current + 1)
                    }} sx={{ mt: 2 }} />
                )}

                {validPeriod && serviceId && availabilityState === 'ready' && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <FormSelect
                      label="Veículo compatível e disponível"
                      value={vehicleId}
                      onChange={(value) => { setVehicleId(value); setScheduleError(''); setIdempotencyKey(createIdempotencyKey()) }}
                      options={availableVehicles.map((vehicle) => ({
                        value: vehicle.id,
                        label: `${vehicle.licensePlate} — ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo'}`,
                      }))}
                      emptyLabel="Selecione um veículo"
                      disabled={availableVehicles.length === 0}
                      helperText="A lista inclui apenas veículos compatíveis e sem impedimentos no período."
                    />
                    {availableVehicles.length === 0 && (
                      <StateFeedback kind="empty" title="Nenhum veículo compatível disponível"
                        description={vehicleAvailability?.some(vehicle => vehicle.reasons.includes('INSUFFICIENT_CAPACITY'))
                          ? `A capacidade cadastrada é menor que os ${selectedRequest.passengers} passageiros solicitados. Ajuste a frota ou revise a solicitação.`
                          : 'Ajuste o período ou escolha outra solicitação de serviço.'} />
                    )}
                    <FormSelect
                      label="Motorista disponível"
                      value={driverId}
                      onChange={(value) => { setDriverId(value); setScheduleError(''); setIdempotencyKey(createIdempotencyKey()) }}
                      options={availableDrivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                      emptyLabel="Selecione um motorista"
                      disabled={availableDrivers.length === 0}
                      helperText="A lista considera afastamentos, validade da CNH e conflitos de agenda."
                    />
                    {availableDrivers.length === 0 && (
                      <StateFeedback kind="empty" title="Nenhum motorista disponível"
                        description={driverAvailability?.some(driver => driver.reasons.includes('ACCOUNT_UNAVAILABLE'))
                          ? 'Os motoristas precisam ter uma conta ativa vinculada com perfil MOTORISTA.'
                          : 'Ajuste o período e consulte novamente.'} />
                    )}
                  </Stack>
                )}

                {scheduleError && (
                  <Alert severity="error" role="alert" sx={{ mt: 2 }}>
                    {scheduleError}
                  </Alert>
                )}
                <Button
                  variant="contained"
                  startIcon={<EventAvailableIcon aria-hidden="true" />}
                  onClick={submitSchedule}
                  disabled={!canSubmit}
                  aria-busy={submitting ? 'true' : undefined}
                  sx={{ minHeight: 44, mt: 2 }}
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
