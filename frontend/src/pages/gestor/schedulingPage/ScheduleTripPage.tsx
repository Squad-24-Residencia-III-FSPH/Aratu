import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import { useAuth } from '../../../auth/useAuth'
import { resolveProfile } from '../../../auth/profiles'
import { canScheduleTrips } from '../../../trips/tripSchedulingAccess'
import type { ApprovedRequestSummary, DriverAvailability, VehicleAvailability } from '../../../trips/tripTypes'
import { scheduleTrip } from '../../../services/tripsService'
import {
  listApprovedRequests,
  listAvailableDrivers,
  listAvailableVehicles,
} from '../../../services/schedulingService'

const OPERATIONAL_TIME_ZONE = 'America/Maceio'

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

function operationalParts(timestamp: number): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]))
}

function offsetMinutesAt(timestamp: number): number {
  const parts = operationalParts(timestamp)
  const wallTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second))
  return Math.round((wallTime - timestamp) / 60_000)
}

/** Converte o horário local informado para ISO 8601 no fuso operacional da FSPH. */
function toOperationalIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  const firstOffset = offsetMinutesAt(wallTime)
  const timestamp = wallTime - firstOffset * 60_000
  const actualOffset = offsetMinutesAt(timestamp)
  const actualParts = operationalParts(timestamp)
  if (actualOffset !== firstOffset || Number(actualParts.year) !== year
    || Number(actualParts.month) !== month || Number(actualParts.day) !== day
    || Number(actualParts.hour) !== hour || Number(actualParts.minute) !== minute) return null
  const sign = actualOffset < 0 ? '-' : '+'
  const absoluteOffset = Math.abs(actualOffset)
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`
  return `${value}:00${offset}`
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'
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
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canScheduleTrips(profile)
  const [requests, setRequests] = useState<ApprovedRequestSummary[] | null>(null)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError, setRequestsError] = useState('')
  const [requestRefresh, setRequestRefresh] = useState(0)
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [period, setPeriod] = useState<PeriodValue>({ start: '', end: '' })
  const [vehicleAvailability, setVehicleAvailability] = useState<VehicleAvailability[] | null>(null)
  const [driverAvailability, setDriverAvailability] = useState<DriverAvailability[] | null>(null)
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>('idle')
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!allowed) {
      setRequestsLoading(false)
      return
    }
    let current = true
    setRequestsLoading(true)
    setRequestsError('')
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

  const selectedRequest = useMemo(
    () => requests?.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  )
  const scheduledStart = toOperationalIso(period.start)
  const scheduledEnd = toOperationalIso(period.end)
  const validPeriod = Boolean(scheduledStart && scheduledEnd && Date.parse(scheduledEnd) > Date.parse(scheduledStart))
  const invalidWallTime = Boolean((period.start && !scheduledStart) || (period.end && !scheduledEnd))

  useEffect(() => {
    if (!selectedRequest || !validPeriod || !scheduledStart || !scheduledEnd) {
      setAvailabilityState('idle')
      setVehicleAvailability(null)
      setDriverAvailability(null)
      setAvailabilityError('')
      return
    }
    let current = true
    setAvailabilityState('loading')
    setAvailabilityError('')
    setVehicleAvailability(null)
    setDriverAvailability(null)
    setVehicleId('')
    setDriverId('')
    void Promise.allSettled([
      listAvailableVehicles(api, scheduledStart, scheduledEnd, selectedRequest.serviceId),
      listAvailableDrivers(api, scheduledStart, scheduledEnd),
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
  }, [api, selectedRequest, scheduledStart, scheduledEnd, validPeriod, availabilityRefresh])

  const availableVehicles = vehicleAvailability?.filter((vehicle) => vehicle.available) ?? []
  const availableDrivers = driverAvailability?.filter((driver) => driver.available) ?? []
  const selectedVehicleIsAvailable = availableVehicles.some((vehicle) => vehicle.id === vehicleId)
  const selectedDriverIsAvailable = availableDrivers.some((driver) => driver.id === driverId)
  const canSubmit = Boolean(selectedRequest && validPeriod && selectedVehicleIsAvailable
    && selectedDriverIsAvailable && availabilityState === 'ready' && !submitting)

  function chooseRequest(request: ApprovedRequestSummary) {
    setSelectedRequestId(request.id)
    setPeriod({ start: '', end: '' })
    setVehicleId('')
    setDriverId('')
    setScheduleError('')
    setSuccessMessage('')
  }

  function changePeriod(field: keyof PeriodValue, value: string) {
    setPeriod((current) => ({ ...current, [field]: value }))
    setVehicleId('')
    setDriverId('')
    setScheduleError('')
  }

  async function submitSchedule() {
    if (!selectedRequest || !scheduledStart || !scheduledEnd || !vehicleId || !driverId || !canSubmit) return
    setSubmitting(true)
    setScheduleError('')
    setSuccessMessage('')
    try {
      const trip = await scheduleTrip(api, {
        requestId: selectedRequest.id,
        vehicleId,
        driverId,
        scheduledStart,
        scheduledEnd,
      })
      setSuccessMessage(`Solicitação #${selectedRequest.id} agendada com sucesso como viagem #${trip.id}.`)
      setSelectedRequestId('')
      setPeriod({ start: '', end: '' })
      setVehicleId('')
      setDriverId('')
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
        breadcrumbs={['Início', 'Agendar viagem']}
        description="Escolha uma solicitação aprovada e aloque recursos disponíveis para o período previsto."
      />

      {successMessage && (
        <Alert severity="success" role="status" aria-live="polite" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {requestsError ? (
        <StateFeedback kind="error" title="Não foi possível carregar as solicitações aprovadas"
          description={requestsError} actionLabel="Tentar novamente"
          onAction={() => setRequestRefresh((current) => current + 1)} />
      ) : requestsLoading ? (
        <StateFeedback kind="loading" title="Carregando solicitações aprovadas..." />
      ) : requests?.length === 0 ? (
        <StateFeedback kind="empty" title="Nenhuma solicitação aguardando agendamento"
          description="As solicitações aparecerão aqui depois que o Gestor as aprovar." />
      ) : (
        <>
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
            <Stack spacing={2.5} sx={{ mt: 3 }}>
              <Paper component="section" aria-labelledby="request-summary-title" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
                <Typography id="request-summary-title" component="h2" variant="h6" sx={{ mb: 2 }}>
                  Resumo da solicitação #{selectedRequest.id}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  {fieldValue('Tipo de serviço', selectedRequest.serviceName)}
                  {fieldValue('Origem', selectedRequest.origin)}
                  {fieldValue('Destino', selectedRequest.destination)}
                  {fieldValue('Finalidade', selectedRequest.purpose)}
                  {fieldValue('Data solicitada', selectedRequest.requestedDate.split('-').reverse().join('/'))}
                  {fieldValue('Horário solicitado', selectedRequest.requestedTime)}
                  {fieldValue('Passageiros', String(selectedRequest.passengers))}
                </Box>
              </Paper>

              <Paper component="section" aria-labelledby="schedule-form-title" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
                <Typography id="schedule-form-title" component="h2" variant="h6" sx={{ mb: 0.5 }}>
                  Período e alocação
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Informe o período no horário local de Aracaju. A disponibilidade considera o tipo de serviço, a agenda e a situação atual dos recursos.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
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
                    onAction={() => setAvailabilityRefresh((current) => current + 1)} sx={{ mt: 2 }} />
                )}
                {availabilityState === 'partial' && (
                  <StateFeedback kind="partial" title="Consulta de disponibilidade incompleta"
                    description={availabilityError} actionLabel="Tentar novamente"
                    onAction={() => setAvailabilityRefresh((current) => current + 1)} sx={{ mt: 2 }} />
                )}

                {validPeriod && availabilityState === 'ready' && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <FormSelect
                      label="Veículo compatível e disponível"
                      value={vehicleId}
                      onChange={(value) => { setVehicleId(value); setScheduleError('') }}
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
                        description="Ajuste o período ou escolha outra solicitação de serviço." />
                    )}
                    <FormSelect
                      label="Motorista disponível"
                      value={driverId}
                      onChange={(value) => { setDriverId(value); setScheduleError('') }}
                      options={availableDrivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                      emptyLabel="Selecione um motorista"
                      disabled={availableDrivers.length === 0}
                      helperText="A lista considera afastamentos, validade da CNH e conflitos de agenda."
                    />
                    {availableDrivers.length === 0 && (
                      <StateFeedback kind="empty" title="Nenhum motorista disponível"
                        description="Ajuste o período e consulte novamente." />
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
