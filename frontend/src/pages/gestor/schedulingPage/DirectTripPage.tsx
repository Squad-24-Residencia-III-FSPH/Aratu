import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from '@mui/material'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from '../../../auth/useAuth'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import { listFleetServices } from '../../../services/fleetServicesService'
import type { FleetService } from '../../../services/fleetServicesService'
import { listAvailableDrivers, listAvailableVehicles } from '../../../services/schedulingService'
import type { DriverAvailability, VehicleAvailability } from '../../../trips/tripTypes'
import { createDirectTrip } from '../../../services/tripsService'
import { operationalDateTimeToIso } from '../../../time/operationalTime'
import { TRIP_AGENDA_PATH } from '../../../trips/tripAgendaTypes'

type AvailabilityState = 'idle' | 'loading' | 'ready' | 'partial' | 'error'

function randomIdempotencyKey(): string {
  return crypto.randomUUID()
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'
}

/** Cria viagem operacional por iniciativa do Gestor, sem associar solicitação. */
export default function DirectTripPage() {
  const { api } = useAuth()
  const [services, setServices] = useState<FleetService[] | null>(null)
  const [servicesError, setServicesError] = useState('')
  const [serviceRefresh, setServiceRefresh] = useState(0)
  const [serviceId, setServiceId] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [purpose, setPurpose] = useState('')
  const [passengers, setPassengers] = useState('1')
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [notes, setNotes] = useState('')
  const [period, setPeriod] = useState({ start: '', end: '' })
  const [vehicleAvailability, setVehicleAvailability] = useState<VehicleAvailability[] | null>(null)
  const [driverAvailability, setDriverAvailability] = useState<DriverAvailability[] | null>(null)
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>('idle')
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [specialRequirementsAcknowledged, setSpecialRequirementsAcknowledged] = useState(false)
  const [evidenceDescription, setEvidenceDescription] = useState('')
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(randomIdempotencyKey)
  const [submitting, setSubmitting] = useState(false)
  const [createdTripId, setCreatedTripId] = useState('')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let current = true
    void listFleetServices(api).then((loaded) => {
      if (!current) return
      setServices(loaded.filter((service) => service.active))
    }).catch((error: unknown) => {
      if (current) setServicesError(formatError(error))
    })
    return () => { current = false }
  }, [api, serviceRefresh])

  const selectedService = useMemo(() => services?.find((service) => service.id === serviceId) ?? null,
    [services, serviceId])
  const passengerCount = Number(passengers)
  const scheduledStart = useMemo(() => {
    try { return period.start ? operationalDateTimeToIso(period.start) : null } catch { return null }
  }, [period.start])
  const scheduledEnd = useMemo(() => {
    try { return period.end ? operationalDateTimeToIso(period.end) : null } catch { return null }
  }, [period.end])
  const validPeriod = Boolean(scheduledStart && scheduledEnd && Date.parse(scheduledEnd) > Date.parse(scheduledStart))

  useEffect(() => {
    if (!serviceId || !validPeriod || !scheduledStart || !scheduledEnd) return
    let current = true
    setAvailabilityState('loading')
    setAvailabilityError('')
    void Promise.allSettled([
      listAvailableVehicles(api, scheduledStart, scheduledEnd, serviceId),
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
  }, [api, serviceId, scheduledStart, scheduledEnd, validPeriod, availabilityRefresh])

  const availableVehicles = vehicleAvailability?.filter((vehicle) => vehicle.available && vehicle.seats >= passengerCount) ?? []
  const availableDrivers = driverAvailability?.filter((driver) => driver.available) ?? []
  const selectedVehicleIsAvailable = availableVehicles.some((vehicle) => vehicle.id === vehicleId)
  const selectedDriverIsAvailable = availableDrivers.some((driver) => driver.id === driverId)
  const validPassengers = Number.isSafeInteger(passengerCount) && passengerCount > 0
  const canSubmit = Boolean(selectedService && origin.trim() && destination.trim() && purpose.trim()
    && validPassengers && validPeriod && selectedVehicleIsAvailable && selectedDriverIsAvailable
    && availabilityState === 'ready' && !submitting && !createdTripId
    && (!specialRequirements.trim() || (specialRequirementsAcknowledged && evidenceDescription.trim())))

  function updateForm(change: () => void) {
    change()
    setCreatedTripId('')
    setSubmitError('')
    setIdempotencyKey(randomIdempotencyKey())
  }

  function updateService(value: string) {
    updateForm(() => setServiceId(value))
    setVehicleId('')
    setDriverId('')
    setAvailabilityState('idle')
    setVehicleAvailability(null)
    setDriverAvailability(null)
  }

  function updatePeriod(field: 'start' | 'end', value: string) {
    updateForm(() => setPeriod((current) => ({ ...current, [field]: value })))
    setVehicleId('')
    setDriverId('')
    setVehicleAvailability(null)
    setDriverAvailability(null)
    setAvailabilityState('idle')
  }

  async function submit() {
    if (!canSubmit || !scheduledStart || !scheduledEnd || !selectedService) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const trip = await createDirectTrip(api, {
        serviceId,
        vehicleId,
        driverId,
        scheduledStart,
        scheduledEnd,
        origin: origin.trim(),
        destination: destination.trim(),
        purpose: purpose.trim(),
        passengers: passengerCount,
        specialRequirements: specialRequirements.trim() || null,
        notes: notes.trim() || null,
        specialRequirementsAcknowledged,
        evidenceDescription: evidenceDescription.trim() || null,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }, idempotencyKey)
      setCreatedTripId(trip.id)
    } catch (error) {
      setSubmitError(formatError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      <PageHeader title="Criar viagem" description="Registre uma viagem iniciada pelo Gestor e aloque os recursos para a demanda." />
      {servicesError && <StateFeedback kind="error" title="Não foi possível carregar os tipos de serviço"
                description={servicesError} actionLabel="Tentar novamente" onAction={() => {
          setServices(null)
          setServicesError('')
          setServiceRefresh((value) => value + 1)
        }} />}
      {!servicesError && services === null && <StateFeedback kind="loading" title="Carregando tipos de serviço..." />}
      {services !== null && services.length === 0 && <StateFeedback kind="empty" title="Nenhum tipo de serviço ativo"
        description="Cadastre ou ative um tipo de serviço antes de criar a viagem." />}
      {services && services.length > 0 && (
        <Stack spacing={2.5}>
          {createdTripId && <Alert severity="success" role="status" aria-live="polite">
            Viagem #{createdTripId} criada e agendada. O motorista poderá iniciar a execução pelo fluxo habitual.
          </Alert>}
          <Paper component="section" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Dados da demanda</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <FormSelect label="Tipo de serviço" value={serviceId} onChange={updateService}
                options={services.map((service) => ({ value: service.id, label: service.name }))}
                emptyLabel="Selecione um tipo de serviço" required disabled={submitting} />
              <FormField label="Quantidade de passageiros" type="number" value={passengers}
                onChange={(value) => { updateForm(() => setPassengers(value)); setVehicleId('') }} required disabled={submitting}
                inputMode="numeric" />
              <FormField label="Origem" value={origin} onChange={(value) => updateForm(() => setOrigin(value))} required disabled={submitting} />
              <FormField label="Destino" value={destination} onChange={(value) => updateForm(() => setDestination(value))} required disabled={submitting} />
              <FormField label="Finalidade" value={purpose} onChange={(value) => updateForm(() => setPurpose(value))} required disabled={submitting} />
              <FormField label="Necessidades especiais" value={specialRequirements}
                onChange={(value) => {
                  updateForm(() => setSpecialRequirements(value))
                  if (!value.trim()) {
                    setSpecialRequirementsAcknowledged(false)
                    setEvidenceDescription('')
                  }
                }} disabled={submitting}
                helperText="Informe adaptações ou condições necessárias para a viagem." />
              <FormField label="Observações" value={notes} onChange={(value) => updateForm(() => setNotes(value))}
                multiline minRows={2} disabled={submitting} />
              <FormField label="Justificativa do agendamento" value={reason}
                onChange={(value) => updateForm(() => setReason(value))} multiline minRows={2} disabled={submitting}
                helperText="Opcional; quando vazia, será registrado o motivo padrão do sistema." />
            </Box>
          </Paper>

          <Paper component="section" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
            <Typography component="h2" variant="h6" sx={{ mb: 0.5 }}>Período e alocação</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              A disponibilidade considera o tipo de serviço, a agenda e a situação dos recursos.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <FormField label="Início previsto" type="datetime-local" value={period.start}
                onChange={(value) => updatePeriod('start', value)} required disabled={submitting} />
              <FormField label="Término previsto" type="datetime-local" value={period.end}
                onChange={(value) => updatePeriod('end', value)} required disabled={submitting} />
            </Box>
            {period.start && period.end && !validPeriod && <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
              Informe datas válidas e um término posterior ao início.
            </Alert>}
            {specialRequirements.trim() && <Stack spacing={1} sx={{ mt: 2 }}>
              <Alert severity="info"><strong>Conferência necessária:</strong> {specialRequirements}</Alert>
              <FormControlLabel control={<Checkbox checked={specialRequirementsAcknowledged} disabled={submitting}
                onChange={(event) => updateForm(() => setSpecialRequirementsAcknowledged(event.target.checked))} />}
                label="Confirmei que o recurso alocado atende às necessidades descritas" />
              <FormField label="Como as necessidades serão atendidas" value={evidenceDescription}
                onChange={(value) => updateForm(() => setEvidenceDescription(value))} required multiline minRows={2} disabled={submitting}
                helperText="Registre a adaptação ou o apoio que foi conferido." />
            </Stack>}
            {availabilityState === 'loading' && <StateFeedback kind="loading" title="Consultando disponibilidade de veículos e motoristas..." sx={{ mt: 2 }} />}
            {(availabilityState === 'error' || availabilityState === 'partial') && <StateFeedback
              kind={availabilityState} title={availabilityState === 'error' ? 'Não foi possível consultar a disponibilidade' : 'Consulta de disponibilidade incompleta'}
              description={availabilityError} actionLabel="Tentar novamente" onAction={() => {
                setAvailabilityState('loading')
                setAvailabilityRefresh((value) => value + 1)
              }} sx={{ mt: 2 }} />}
            {validPeriod && availabilityState === 'ready' && <Stack spacing={2} sx={{ mt: 2 }}>
              <FormSelect label="Veículo compatível e disponível" value={vehicleId}
                onChange={(value) => { setVehicleId(value); setSubmitError('') }}
                options={availableVehicles.map((vehicle) => ({ value: vehicle.id,
                  label: `${vehicle.licensePlate} — ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo'} (${vehicle.seats} lugares)` }))}
                emptyLabel="Selecione um veículo" disabled={!availableVehicles.length || submitting}
                helperText="A lista considera compatibilidade e capacidade para os passageiros informados." />
              {!availableVehicles.length && <StateFeedback kind="empty" title="Nenhum veículo compatível disponível"
                description={vehicleAvailability?.some((vehicle) => vehicle.available && vehicle.seats < passengerCount)
                  ? `Nenhum veículo disponível comporta os ${passengerCount} passageiros informados.`
                  : 'Ajuste o período ou escolha outro tipo de serviço.'} />}
              <FormSelect label="Motorista disponível" value={driverId}
                onChange={(value) => { setDriverId(value); setSubmitError('') }}
                options={availableDrivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                emptyLabel="Selecione um motorista" disabled={!availableDrivers.length || submitting}
                helperText="A lista considera afastamentos, validade da CNH e conflitos de agenda." />
              {!availableDrivers.length && <StateFeedback kind="empty" title="Nenhum motorista disponível"
                description="Ajuste o período e consulte novamente." />}
            </Stack>}
            {submitError && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{submitError}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              <Button variant="contained" startIcon={<EventAvailableIcon aria-hidden="true" />} onClick={() => void submit()}
                disabled={!canSubmit} aria-busy={submitting ? 'true' : undefined} sx={{ minHeight: 44 }}>
                {submitting ? 'Criando viagem...' : createdTripId ? 'Viagem criada' : 'Criar viagem agendada'}
              </Button>
              {createdTripId && <Button component={RouterLink} to={TRIP_AGENDA_PATH} variant="outlined" sx={{ minHeight: 44 }}>
                Abrir agenda
              </Button>}
            </Stack>
          </Paper>
        </Stack>
      )}
    </Box>
  )
}
